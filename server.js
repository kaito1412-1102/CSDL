const express = require('express');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

function getConfig() {
  const configPath = path.join(__dirname, 'csdl-mon-hoc', 'config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Trim khoảng trắng thừa khỏi từng thành phần của đường dẫn
function normPath(p) {
  return p.split(/[\\/]/).map(s => s.trim()).join(path.sep);
}

function findMon(monName) {
  const { mon } = getConfig();
  return mon.find(m => m.name === monName);
}

// GET /api/config — trả về danh sách môn học
app.get('/api/config', (req, res) => {
  try {
    res.json(getConfig());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mở rộng !ref của worksheet để đọc đủ tất cả ô có dữ liệu
// (Excel đôi khi lưu !ref bị thiếu do merged cells)
function expandSheetRef(ws) {
  const cellKeys = Object.keys(ws).filter(k => !k.startsWith('!'));
  if (!cellKeys.length) return;
  let maxR = 0, maxC = 0;
  cellKeys.forEach(addr => {
    const { r, c } = XLSX.utils.decode_cell(addr);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  });
  ws['!ref'] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r: maxR, c: maxC });
}

// GET /api/bangdiem/:monName — đọc file bang-diem.xlsx, trả về mảng 2D
app.get('/api/bangdiem/:monName', (req, res) => {
  try {
    const mon = findMon(req.params.monName);
    if (!mon) return res.status(404).json({ error: 'Không tìm thấy môn học' });

    const filePath = path.join(__dirname, normPath(mon.path));
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    expandSheetRef(ws);
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    res.json({ rows, mon });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/nhanxet/:monName — đọc nhan-xet.xlsx, trả về [{ma, noiDung}]
app.get('/api/nhanxet/:monName', (req, res) => {
  try {
    const mon = findMon(req.params.monName);
    if (!mon) return res.status(404).json({ error: 'Không tìm thấy môn học' });

    const filePath = path.join(__dirname, normPath(mon.pathnhanxet));
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    const mapped = rows.map(r => ({
      ma: String(r[0] || '').trim(),
      noiDung: String(r[1] || '').trim(),
    }));
    // Bỏ qua dòng header nếu có (ô đầu tiên chứa chữ "mã")
    const startIdx = mapped.length > 0 && mapped[0].ma.toLowerCase().includes('mã') ? 1 : 0;
    const list = mapped.slice(startIdx).filter(r => r.ma);

    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/export/:monName — ghi các ô đã sửa vào file Excel
app.post('/api/export/:monName', (req, res) => {
  try {
    const mon = findMon(req.params.monName);
    if (!mon) return res.status(404).json({ error: 'Không tìm thấy môn học' });

    const { cells } = req.body; // [{address: "H10", value: "T"}, ...]
    const filePath = path.join(__dirname, normPath(mon.path));
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    expandSheetRef(ws);

    cells.forEach(({ address, value }) => {
      const addr = address.toUpperCase();
      const numVal = Number(value);
      const isNum = value !== '' && !isNaN(numVal);
      ws[addr] = {
        t: isNum ? 'n' : 's',
        v: isNum ? numVal : value,
        w: String(value),
      };
    });

    XLSX.writeFile(wb, filePath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/nhanxet/:monName — ghi danh sách nhận xét vào file Excel
app.post('/api/nhanxet/:monName', (req, res) => {
  try {
    const mon = findMon(req.params.monName);
    if (!mon) return res.status(404).json({ error: 'Không tìm thấy môn học' });

    const { list } = req.body; // [{ma, noiDung}]
    if (!Array.isArray(list)) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });

    const filePath = path.join(__dirname, normPath(mon.pathnhanxet));
    const rows = list.map(item => [item.ma, item.noiDung]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filePath);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
});
