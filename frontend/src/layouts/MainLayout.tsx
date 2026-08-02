import { useCallback, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Drawer, Dropdown, Grid, Input, Modal, message } from 'antd';
import {
  UserOutlined,
  LogoutOutlined,
  MenuOutlined,
  HomeOutlined,
  WalletOutlined,
  BankOutlined,
  TeamOutlined,
  CheckSquareOutlined,
  FlagOutlined,
  EditOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { todayStr } from '../utils/helpers';
import * as XLSX from 'xlsx';
import { importExportApi } from '../services/importExportApi';
import { profileApi } from '../services/profileApi';

const NAV_TABS = [
  { path: '/', label: '工作台', icon: <HomeOutlined /> },
  { path: '/plans', label: '计划', icon: <FlagOutlined /> },
  { path: '/expenses', label: '收支', icon: <WalletOutlined /> },
  { path: '/deposits', label: '存款', icon: <BankOutlined /> },
  { path: '/todos', label: '待办', icon: <CheckSquareOutlined /> },
];

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileModal, setProfileModal] = useState<'username' | 'password' | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const saveUsername = async () => {
    const name = newUsername.trim();
    if (!name) { message.warning('请输入新用户名'); return; }
    setSavingProfile(true);
    try {
      await profileApi.updateUsername({ new_username: name });
      message.success('用户名已更新');
      setProfileModal(null);
      const saved = localStorage.getItem('fintracker_user');
      if (saved) {
        const u = JSON.parse(saved);
        localStorage.setItem('fintracker_user', JSON.stringify({ ...u, username: name }));
      }
      window.location.reload();
    } catch {
      message.error('更新失败（用户名可能已被占用）');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    if (!oldPassword || !newPassword) { message.warning('请填写完整'); return; }
    setSavingProfile(true);
    try {
      await profileApi.updatePassword({ old_password: oldPassword, new_password: newPassword });
      message.success('密码已更新');
      setProfileModal(null);
      setOldPassword('');
      setNewPassword('');
    } catch (e: any) {
      if (e?.response?.status === 401) message.error('原密码不正确');
      else message.error('更新失败');
    } finally {
      setSavingProfile(false);
    }
  };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname === path;

  const goTo = (path: string) => {
    navigate(path);
    setDrawerOpen(false);
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
    { key: 'sharing', icon: <TeamOutlined />, label: '共享管理', onClick: () => navigate('/sharing') },
    { key: 'username', icon: <EditOutlined />, label: '修改用户名', onClick: () => { setNewUsername(user?.username || ''); setProfileModal('username'); } },
    { key: 'password', icon: <KeyOutlined />, label: '修改密码', onClick: () => { setOldPassword(''); setNewPassword(''); setProfileModal('password'); } },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout },
  ];

  const toolButtons = (
    <>
      <Button size="small" type="text" onClick={handleCopy}>复制</Button>
      <Button size="small" type="text" onClick={() => { setPasteText(''); setPasteOpen(true); }}>粘贴导入</Button>
      <Button size="small" type="text" onClick={() => fileInputRef.current?.click()}>导入Excel</Button>
      <Button size="small" type="text" onClick={handleExportExcel}>导出Excel</Button>
    </>
  );

  const navList = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {NAV_TABS.map((tab) => (
        <Button
          key={tab.path}
          type={isActive(tab.path) ? 'primary' : 'text'}
          icon={tab.icon}
          block
          onClick={() => goTo(tab.path)}
          style={{
            justifyContent: 'flex-start',
            height: 44,
            borderRadius: 6,
            fontWeight: isActive(tab.path) ? 600 : 400,
          }}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );

  const drawerTools = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
      {['复制数据', '粘贴导入', '导入Excel', '导出Excel'].map((label, i) => (
        <Button
          key={label}
          type="text"
          block
          style={{ justifyContent: 'flex-start' }}
          onClick={() => {
            setDrawerOpen(false);
            if (i === 0) handleCopy();
            else if (i === 1) { setPasteText(''); setPasteOpen(true); }
            else if (i === 2) fileInputRef.current?.click();
            else handleExportExcel();
          }}
        >
          {label}
        </Button>
      ))}
      <Button type="text" danger block style={{ justifyContent: 'flex-start' }} onClick={handleLogout}>
        退出登录
      </Button>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部导航 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: isMobile ? '0 8px' : '0 16px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fff',
          gap: isMobile ? 8 : 4,
          flexShrink: 0,
          minHeight: 46,
        }}
      >
        {isMobile && (
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setDrawerOpen(true)}
            aria-label="打开导航"
          />
        )}
        <span
          style={{
            fontWeight: 700,
            fontSize: 16,
            color: '#1a1a2e',
            marginRight: isMobile ? 4 : 16,
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          FinTracker
        </span>

        {!isMobile && NAV_TABS.map((tab) => (
          <Button
            key={tab.path}
            type={isActive(tab.path) ? 'primary' : 'text'}
            onClick={() => navigate(tab.path)}
            style={{ borderRadius: 0, height: 46 }}
          >
            {tab.label}
          </Button>
        ))}

        <div style={{ flex: 1 }} />

        {!isMobile && toolButtons}

        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Button type="text" icon={<UserOutlined />} style={{ marginLeft: isMobile ? 0 : 8 }}>
            {!isMobile && user?.username}
          </Button>
        </Dropdown>

        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileImport} />
      </div>

      {/* 页面内容 */}
      <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? 8 : 16 }}>
        <Outlet />
      </div>

      {/* 移动端左侧抽屉导航 */}
      <Drawer
        title="FinTracker"
        placement="left"
        size={264}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 12 } }}
      >
        {navList}
        {drawerTools}
      </Drawer>

      {/* 粘贴导入弹窗 */}
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

      {/* 修改用户名 */}
      <Modal
        title="修改用户名"
        open={profileModal === 'username'}
        onOk={saveUsername}
        onCancel={() => setProfileModal(null)}
        okText="保存"
        cancelText="取消"
        confirmLoading={savingProfile}
        destroyOnHidden
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>新用户名</div>
        <Input
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          maxLength={50}
          placeholder="请输入新用户名"
        />
      </Modal>

      {/* 修改密码 */}
      <Modal
        title="修改密码"
        open={profileModal === 'password'}
        onOk={savePassword}
        onCancel={() => setProfileModal(null)}
        okText="保存"
        cancelText="取消"
        confirmLoading={savingProfile}
        destroyOnHidden
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>原密码</div>
          <Input.Password
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="请输入原密码"
          />
        </div>
        <div>
          <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>新密码</div>
          <Input.Password
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="请输入新密码"
          />
        </div>
      </Modal>
    </div>
  );
}
