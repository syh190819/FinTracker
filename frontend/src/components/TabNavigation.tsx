import { useCallback, useRef, useState } from 'react';
import { Modal } from 'antd';
import type { TabKey, FinanceData } from '../types';
import type { ShowDialogFn } from './CustomDialog';
import { loadDataFromStorage, saveDataToStorage } from '../utils/dataStore';
import { todayStr, uid } from '../utils/helpers';
import * as XLSX from 'xlsx';

interface Props {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  showDialog: ShowDialogFn;
  data: FinanceData;
  onImport: (data: FinanceData) => void;
}

const TAB_CONFIG: { key: TabKey; label: string }[] = [
  { key: 'expense', label: '记账' },
  { key: 'budget', label: '预算' },
  { key: 'deposit', label: '存款' },
];

const TabNavigation: React.FC<Props> = ({ activeTab, onTabChange, showDialog, data, onImport }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // ─── 复制数据到剪贴板 ─────────────────────────────────
  const handleCopy = useCallback(async () => {
    const payload = JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      showDialog({ mode: 'alert', title: '提示', message: '数据已复制到剪贴板，可粘贴到微信发送' });
    } catch {
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showDialog({ mode: 'alert', title: '提示', message: '数据已复制到剪贴板，可粘贴到微信发送' });
    }
  }, [data, showDialog]);

  // ─── 粘贴导入 ───────────────────────────────────────────
  const handlePasteImport = useCallback(async () => {
    setPasteText('');
    setPasteOpen(true);
  }, []);

  const confirmPasteImport = useCallback(async () => {
    const raw = pasteText.trim();
    if (!raw) {
      showDialog({ mode: 'alert', title: '提示', message: '请先粘贴数据' });
      return;
    }
    try {
      const imported = JSON.parse(raw);
      if (!imported.expenses || !imported.budgets || !imported.depositPlans) {
        showDialog({ mode: 'alert', title: '提示', message: '数据格式不正确，请确认复制了完整的数据' });
        return;
      }
      const ok = await showDialog({
        mode: 'confirm',
        title: '确认导入',
        message: '导入将覆盖当前全部数据（收支记录、预算、存款计划），是否继续？',
      });
      if (!ok) return;
      onImport(imported);
      setPasteOpen(false);
      showDialog({ mode: 'alert', title: '提示', message: '导入成功！' });
    } catch {
      showDialog({ mode: 'alert', title: '提示', message: '数据解析失败，请确认粘贴的是有效的 JSON 数据' });
    }
  }, [pasteText, showDialog, onImport]);

  // ─── 导入 Excel ──────────────────────────────────────────
  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'array' });
        await importFromWorkbook(wb);
      } catch {
        showDialog({ mode: 'alert', title: '提示', message: '文件读取失败，请确认是有效的 Excel 文件' });
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, [showDialog, onImport]);

  const importFromWorkbook = useCallback(async (wb: XLSX.WorkBook) => {
    const imported: FinanceData = {
      categories: ['餐饮', '交通', '购物', '娱乐', '住房', '医疗', '教育', '其他'],
      summaryExcludeCategories: [],
      budgets: {},
      expenses: [],
      depositPlans: [],
    };

    if (wb.SheetNames.includes('支出记录')) {
      const sheet = XLSX.utils.sheet_to_json<any>(wb.Sheets['支出记录']);
      sheet.forEach(row => {
        if (row['日期'] && row['品类'] && row['金额'] != null) {
          imported.expenses.push({
            id: uid(), amount: parseFloat(row['金额']) || 0,
            category: String(row['品类']), date: String(row['日期']),
            note: row['备注'] ? String(row['备注']) : '',
            createdAt: new Date().toISOString(),
          });
        }
      });
    }
    if (wb.SheetNames.includes('预算设置')) {
      const sheet = XLSX.utils.sheet_to_json<any>(wb.Sheets['预算设置']);
      sheet.forEach(row => {
        if (row['月份'] && row['品类'] && row['月预算金额'] != null) {
          const month = String(row['月份']);
          if (!imported.budgets[month]) imported.budgets[month] = {};
          imported.budgets[month][String(row['品类'])] = {
            amount: parseFloat(row['月预算金额']) || 0,
            splitByDay: row['按天拆分'] === '是',
          };
        }
      });
    }
    if (wb.SheetNames.includes('存款计划汇总')) {
      const sheet = XLSX.utils.sheet_to_json<any>(wb.Sheets['存款计划汇总']);
      sheet.forEach(row => {
        if (row['名称'] && row['每月期望存款'] != null) {
          imported.depositPlans.push({
            id: uid(), name: String(row['名称']),
            category: row['品类'] ? String(row['品类']) : '',
            path: row['路径'] ? String(row['路径']) : '',
            monthlyGoal: parseFloat(row['每月期望存款']) || 0,
            saved: parseFloat(row['已存入净额']) || 0,
            deposits: [],
          });
        }
      });
    }
    if (wb.SheetNames.includes('存取记录')) {
      const sheet = XLSX.utils.sheet_to_json<any>(wb.Sheets['存取记录']);
      sheet.forEach(row => {
        if (row['计划名称'] && row['金额'] != null) {
          const plan = imported.depositPlans.find(p => p.name === row['计划名称']);
          if (plan) {
            plan.deposits.push({
              id: uid(), amount: parseFloat(row['金额']) || 0,
              date: row['日期'] ? String(row['日期']) : todayStr(),
              source: row['来源/去向'] ? String(row['来源/去向']) : '',
              note: row['备注'] ? String(row['备注']) : '',
              type: row['类型'] === '取出' ? 'withdraw' : 'deposit',
            });
          }
        }
      });
      imported.depositPlans.forEach(p => {
        p.saved = p.deposits.reduce((s, d) => s + (d.type === 'withdraw' ? -d.amount : d.amount), 0);
      });
    }
    if (wb.SheetNames.includes('品类列表')) {
      const sheet = XLSX.utils.sheet_to_json<any>(wb.Sheets['品类列表']);
      sheet.forEach(row => {
        if (row['品类名称']) {
          const name = String(row['品类名称']);
          if (!imported.categories.includes(name)) imported.categories.push(name);
          if (row['排除统计'] === '是' && !imported.summaryExcludeCategories.includes(name)) {
            imported.summaryExcludeCategories.push(name);
          }
        }
      });
    }

    const stats = {
      expenses: imported.expenses.length,
      budgets: Object.values(imported.budgets).reduce((s, v) => s + Object.keys(v).length, 0),
      plans: imported.depositPlans.length,
    };
    const total = stats.expenses + stats.budgets + stats.plans;
    if (total === 0) {
      showDialog({ mode: 'alert', title: '提示', message: '未识别到有效数据，请确认 Excel 表格格式正确' });
      return;
    }
    onImport(imported);
    showDialog({ mode: 'alert', title: '提示', message: `导入成功！\n支出记录: ${stats.expenses} 条\n预算设置: ${stats.budgets} 项\n存款计划: ${stats.plans} 个` });
  }, [showDialog, onImport]);

  // ─── 导出 Excel ──────────────────────────────────────────
  const handleExport = useCallback(() => {
    const wb = XLSX.utils.book_new();

    const expenseRows = data.expenses.map(e => ({
      '日期': e.date, '品类': e.category, '金额': e.amount, '备注': e.note || '',
    })).sort((a, b) => b['日期'].localeCompare(a['日期']));
    const ws1 = XLSX.utils.json_to_sheet(expenseRows);
    ws1['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws1, '支出记录');

    const budgetRows: any[] = [];
    for (const [month, cats] of Object.entries(data.budgets)) {
      for (const [cat, b] of Object.entries(cats)) {
        budgetRows.push({ '月份': month, '品类': cat, '月预算金额': b.amount, '按天拆分': b.splitByDay ? '是' : '否' });
      }
    }
    budgetRows.sort((a, b) => b['月份'].localeCompare(a['月份']));
    const ws2 = XLSX.utils.json_to_sheet(budgetRows);
    ws2['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, '预算设置');

    const planRows = data.depositPlans.map(p => ({
      '名称': p.name, '品类': p.category, '路径': p.path,
      '每月期望存款': p.monthlyGoal, '已存入净额': p.saved,
    }));
    const ws3 = XLSX.utils.json_to_sheet(planRows);
    ws3['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws3, '存款计划汇总');

    const depositRows: any[] = [];
    data.depositPlans.forEach(p => {
      (p.deposits || []).forEach(d => {
        depositRows.push({
          '计划名称': p.name, '类型': d.type === 'withdraw' ? '取出' : '存入',
          '金额': d.amount, '日期': d.date,
          '来源/去向': d.source || '', '备注': d.note || '',
        });
      });
    });
    depositRows.sort((a, b) => b['日期'].localeCompare(a['日期']));
    const ws4 = XLSX.utils.json_to_sheet(depositRows);
    ws4['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws4, '存取记录');

    const exclCats = data.summaryExcludeCategories || [];
    const catRows = data.categories.map(c => ({ '品类名称': c, '排除统计': exclCats.includes(c) ? '是' : '否' }));
    const ws5 = XLSX.utils.json_to_sheet(catRows);
    ws5['!cols'] = [{ wch: 14 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws5, '品类列表');

    XLSX.writeFile(wb, `FinTrack_${todayStr()}.xlsx`);
  }, [data]);

  return (
    <div className="main-nav">
      <div className="nav-inner" style={{ gap: 0 }}>
        {TAB_CONFIG.map(tab => (
          <a
            key={tab.key}
            className={`nav-link${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </a>
        ))}
        <div className="nav-actions">
          <button className="btn btn-sm btn-outline" onClick={handleCopy} title="复制全部数据到剪贴板">
            复制数据
          </button>
          <button className="btn btn-sm btn-outline" onClick={handlePasteImport} title="从剪贴板粘贴数据导入">
            粘贴导入
          </button>
          <button className="btn btn-sm btn-outline" onClick={() => fileInputRef.current?.click()} title="从Excel导入数据">
            导入Excel
          </button>
          <button className="btn btn-sm btn-outline" onClick={handleExport} title="导出数据为Excel">
            导出Excel
          </button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFileImport}
      />

      {/* Paste import modal */}
      <Modal
        title="粘贴导入数据"
        open={pasteOpen}
        onOk={confirmPasteImport}
        onCancel={() => setPasteOpen(false)}
        okText="导入并覆盖"
        cancelText="取消"
        destroyOnHidden
        centered
      >
        <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 10 }}>
          将从其他设备复制的数据粘贴到下方，将<strong>覆盖</strong>当前数据
        </p>
        <textarea
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          rows={6}
          placeholder="在此粘贴 JSON 数据..."
          style={{
            width: '100%', padding: '10px', border: '1px solid var(--border)',
            borderRadius: 4, fontSize: 12, fontFamily: 'monospace',
            resize: 'vertical', boxSizing: 'border-box',
          }}
        />
      </Modal>
    </div>
  );
};

export default TabNavigation;
