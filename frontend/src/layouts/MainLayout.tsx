import { useCallback, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Modal, message, Dropdown } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { todayStr } from '../utils/helpers';
import * as XLSX from 'xlsx';
import { importExportApi } from '../services/importExportApi';

const NAV_TABS = [
  { path: '/expenses', label: '记账' },
  { path: '/budgets', label: '预算' },
  { path: '/deposits', label: '存款' },
  { path: '/statistics', label: '统计' },
  { path: '/sharing', label: '共享' },
];

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // ── 导出全部数据 ──
  const handleExportExcel = useCallback(async () => {
    try {
      const data = await importExportApi.exportAll();
      const wb = XLSX.utils.book_new();

      const expenseRows = (data.expenses || []).map((e: any) => ({
        '日期': e.date, '品类': e.category, '金额': e.amount, '备注': e.note || '',
      })).sort((a: any, b: any) => b['日期'].localeCompare(a['日期']));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseRows), '支出记录');

      const budgetRows: any[] = [];
      for (const b of data.budgets || []) {
        budgetRows.push({ '月份': b.month, '品类': b.category, '月预算金额': b.amount, '按天拆分': b.split_by_day ? '是' : '否' });
      }
      budgetRows.sort((a: any, b: any) => b['月份'].localeCompare(a['月份']));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(budgetRows), '预算设置');

      const planRows = (data.deposit_plans || []).map((p: any) => ({
        '名称': p.name, '品类': p.category, '每月期望存款': p.monthly_goal, '已存入净额': 0,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(planRows), '存款计划');

      XLSX.writeFile(wb, `FinTrack_${todayStr()}.xlsx`);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    }
  }, []);

  // ── 复制数据 ──
  const handleCopy = useCallback(async () => {
    try {
      const data = await importExportApi.exportAll();
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      message.success('数据已复制到剪贴板');
    } catch {
      message.error('复制失败');
    }
  }, []);

  // ── 粘贴导入 ──
  const confirmPasteImport = useCallback(async () => {
    const raw = pasteText.trim();
    if (!raw) { message.warning('请先粘贴数据'); return; }
    try {
      const data = JSON.parse(raw);
      await importExportApi.importAll(data);
      setPasteOpen(false);
      message.success('导入成功，页面将刷新');
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      message.error('解析或导入失败');
    }
  }, [pasteText]);

  // ── Excel 导入 ──
  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'array' });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        // 简单的导入：由后端处理结构化数据
        // 这里用 base approach：读取整个文件后直接调用 import API
        const data: any = {};
        const sheets = wb.SheetNames;
        if (sheets.includes('支出记录')) {
          data.expenses = XLSX.utils.sheet_to_json(wb.Sheets['支出记录']);
        }
        if (sheets.includes('预算设置')) {
          data.budgets = XLSX.utils.sheet_to_json(wb.Sheets['预算设置']);
        }
        if (sheets.includes('存款计划')) {
          data.deposit_plans = XLSX.utils.sheet_to_json(wb.Sheets['存款计划']);
        }
        await importExportApi.importAll(data);
        message.success('导入成功，页面将刷新');
        setTimeout(() => window.location.reload(), 1000);
      } catch {
        message.error('文件读取或导入失败');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, []);

  const userMenuItems = [
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部导航 */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '0 16px',
        borderBottom: '1px solid #f0f0f0', background: '#fff', gap: 4, flexShrink: 0,
      }}>
        {/* 系统标题 */}
        <span style={{ fontWeight: 700, fontSize: 16, color: '#1a1a2e', marginRight: 16, userSelect: 'none' }}>
          FinTracker
        </span>
        {NAV_TABS.map(tab => (
          <Button
            key={tab.path}
            type={location.pathname === tab.path ? 'primary' : 'text'}
            onClick={() => navigate(tab.path)}
            style={{ borderRadius: 0, height: 46 }}
          >
            {tab.label}
          </Button>
        ))}

        <div style={{ flex: 1 }} />

        {/* 工具按钮 */}
        <Button size="small" type="text" onClick={handleCopy}>复制</Button>
        <Button size="small" type="text" onClick={() => { setPasteText(''); setPasteOpen(true); }}>粘贴导入</Button>
        <Button size="small" type="text" onClick={() => fileInputRef.current?.click()}>导入Excel</Button>
        <Button size="small" type="text" onClick={handleExportExcel}>导出Excel</Button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileImport} />

        {/* 用户信息 */}
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Button type="text" icon={<UserOutlined />} style={{ marginLeft: 8 }}>
            {user?.username}
          </Button>
        </Dropdown>
      </div>

      {/* 页面内容 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <Outlet />
      </div>

      {/* 粘贴导入弹窗 */}
      <Modal
        title="粘贴导入数据"
        open={pasteOpen}
        onOk={confirmPasteImport}
        onCancel={() => setPasteOpen(false)}
        okText="导入并覆盖"
        cancelText="取消"
        destroyOnClose
        centered
      >
        <p style={{ fontSize: 12, color: '#999', marginBottom: 10 }}>
          将从其他设备复制的数据粘贴到下方，将<strong>覆盖</strong>当前数据
        </p>
        <textarea
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          rows={6}
          placeholder="在此粘贴 JSON 数据..."
          style={{
            width: '100%', padding: '10px', border: '1px solid #d9d9d9',
            borderRadius: 4, fontSize: 12, fontFamily: 'monospace',
            resize: 'vertical', boxSizing: 'border-box',
          }}
        />
      </Modal>
    </div>
  );
}
