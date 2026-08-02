import { useCallback, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Dropdown, Grid, Input, Modal, message } from 'antd';
import {
  UserOutlined,
  LogoutOutlined,
  HomeOutlined,
  WalletOutlined,
  BankOutlined,
  TeamOutlined,
  CheckSquareOutlined,
  FlagOutlined,
  EditOutlined,
  KeyOutlined,
  LeftOutlined,
  RightOutlined,
  ArrowLeftOutlined,
  MenuOutlined,
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
  const [collapsed, setCollapsed] = useState(isMobile);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
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

  // ── 导出/导入 ──
  const handleExportExcel = useCallback(async () => {
    try {
      const data = await importExportApi.exportAll();
      const wb = XLSX.utils.book_new();
      const expenseRows = (data.expenses || []).map((e: any) => ({
        '类型': e.type === 'income' ? '收入' : '支出',
        '日期': e.date, '品类': e.category, '金额': e.amount, '备注': e.note || '',
      })).sort((a: any, b: any) => b['日期'].localeCompare(a['日期']));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseRows), '收支记录');
      const budgetRows: any[] = [];
      for (const b of data.budgets || []) {
        budgetRows.push({ '月份': b.month, '品类': b.category, '月预算金额': b.amount, '按天拆分': b.split_by_day ? '是' : '否' });
      }
      budgetRows.sort((a: any, b: any) => b['月份'].localeCompare(a['月份']));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(budgetRows), '预算设置');
      const planRows = (data.deposit_plans || []).map((p: any) => ({
        '名称': p.name, '每月期望存款': p.monthly_goal,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(planRows), '存款计划');
      XLSX.writeFile(wb, `FinTrack_${todayStr()}.xlsx`);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      const data = await importExportApi.exportAll();
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      message.success('数据已复制到剪贴板');
    } catch {
      message.error('复制失败');
    }
  }, []);

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

  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'array' });
        const data: any = {};
        const sheets = wb.SheetNames;
        if (sheets.includes('收支记录')) {
          data.expenses = XLSX.utils.sheet_to_json(wb.Sheets['收支记录']);
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

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname === path;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* 左侧常驻导航 */}
      <div
        style={{
          width: collapsed ? 64 : 220,
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          height: '100vh',
          flexShrink: 0,
          borderRight: '1px solid #f0f0f0',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          transition: 'width .2s',
          boxShadow: collapsed ? 'none' : '2px 0 14px rgba(0,0,0,0.10)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 46,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 16px',
            borderBottom: '1px solid #f0f0f0',
            fontWeight: 700,
            fontSize: 15,
            color: '#1a1a2e',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {collapsed ? 'F' : 'FinTracker'}
        </div>
        <div style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {NAV_TABS.map((tab) => (
            <Button
              key={tab.path}
              type={isActive(tab.path) ? 'primary' : 'text'}
              icon={tab.icon}
              onClick={() => navigate(tab.path)}
              style={{
                justifyContent: collapsed ? 'center' : 'flex-start',
                height: 42,
                borderRadius: 8,
                padding: collapsed ? 0 : '0 12px',
              }}
              title={tab.label}
            >
              {!collapsed && tab.label}
            </Button>
          ))}
        </div>
        <div style={{ padding: 8, borderTop: '1px solid #f0f0f0' }}>
          <Button
            type="text"
            block
            icon={collapsed ? <RightOutlined /> : <LeftOutlined />}
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? '展开' : '收起'}
          >
            {!collapsed && '收起'}
          </Button>
        </div>
      </div>

      {/* 主区域 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', marginLeft: 64 }}>
        {/* 顶栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: isMobile ? '0 8px' : '0 16px',
            borderBottom: '1px solid #f0f0f0',
            background: '#fff',
            gap: 8,
            flexShrink: 0,
            minHeight: 46,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuOutlined /> : <LeftOutlined />}
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? '展开导航' : '收起导航'}
            style={{ marginRight: 4 }}
          />
          {!isMobile && (
            <>
              <Button size="small" type="text" onClick={handleCopy}>复制</Button>
              <Button size="small" type="text" onClick={() => { setPasteText(''); setPasteOpen(true); }}>粘贴导入</Button>
              <Button size="small" type="text" onClick={() => fileInputRef.current?.click()}>导入Excel</Button>
              <Button size="small" type="text" onClick={handleExportExcel}>导出Excel</Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileImport} />
            </>
          )}
          <div style={{ flex: 1 }} />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Button type="text" icon={<UserOutlined />}>
              {!isMobile && user?.username}
            </Button>
          </Dropdown>
        </div>

        {/* 内容区 */}
        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? 8 : 16 }}>
          {location.pathname !== '/' && (
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              style={{ marginBottom: 8, color: '#666' }}
              onClick={() => navigate(-1)}
            >
              返回
            </Button>
          )}
          <Outlet />
        </div>
      </div>

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
        <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} maxLength={50} placeholder="请输入新用户名" />
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
          <Input.Password value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="请输入原密码" />
        </div>
        <div>
          <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>新密码</div>
          <Input.Password value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="请输入新密码" />
        </div>
      </Modal>
    </div>
  );
}
