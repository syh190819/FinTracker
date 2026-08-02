import { useState, useEffect } from 'react';
import { message, Modal, Checkbox, Button, Input } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { sharingApi } from '../services/sharingApi';
import type { SharingWithUsername } from '../types/api';

export default function SharingPage() {
  const [relationships, setRelationships] = useState<SharingWithUsername[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [acceptCode, setAcceptCode] = useState('');
  const [generating, setGenerating] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    loadRelationships();
  }, []);

  const loadRelationships = async () => {
    try {
      const data = await sharingApi.relationships();
      setRelationships(data);
    } catch {
      message.error('加载共享关系失败');
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await sharingApi.invite();
      setInviteCode(res.invite_code);
    } catch {
      message.error('生成邀请码失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      message.success('邀请码已复制');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  const handleAccept = async () => {
    const code = acceptCode.trim();
    if (code.length !== 8) {
      message.warning('请输入8位邀请码');
      return;
    }
    setAccepting(true);
    try {
      await sharingApi.accept(code);
      message.success('已成功加入共享');
      setAcceptCode('');
      setInviteCode('');
      loadRelationships();
    } catch {
      message.error('邀请码无效或已过期');
    } finally {
      setAccepting(false);
    }
  };

  const handleScopeChange = async (
    id: number,
    field: 'expenses' | 'budgets' | 'deposits',
    value: boolean,
  ) => {
    const rel = relationships.find((r) => r.id === id);
    if (!rel) return;

    const newScope = { ...rel.scope, [field]: value };
    try {
      await sharingApi.updateScope(id, { scope: newScope });
      setRelationships((prev) =>
        prev.map((r) => (r.id === id ? { ...r, scope: newScope } : r)),
      );
      message.success('共享范围已更新');
    } catch {
      message.error('更新共享范围失败');
    }
  };

  const handleDelete = (id: number) => {
    const rel = relationships.find((r) => r.id === id);
    if (!rel) return;
    Modal.confirm({
      title: '解除共享关系',
      content: `确认解除与 "${rel.partner_name}" 的共享关系？`,
      okText: '确认解除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await sharingApi.delete(id);
          message.success('已解除共享关系');
          loadRelationships();
        } catch {
          message.error('解除共享关系失败');
        }
      },
    });
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: 1000,
    margin: '0 auto',
    padding: 24,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 24,
    flexWrap: 'wrap',
  };

  const cardStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 320,
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: 24,
  };

  const cardTitleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 20,
    color: '#1a1a1a',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: 24,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 8,
    color: '#333',
  };

  const inviteCodeDisplayStyle: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: 6,
    textAlign: 'center',
    padding: '16px 0',
    color: '#1890ff',
    fontFamily: 'monospace',
    userSelect: 'all',
  };

  const partnerCardStyle: React.CSSProperties = {
    background: '#fafafa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    border: '1px solid #f0f0f0',
  };

  const partnerNameStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 600,
    color: '#1a1a1a',
    marginBottom: 4,
  };

  const metaStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  };

  const scopeLabelStyle: React.CSSProperties = {
    fontSize: 13,
    color: '#555',
    marginBottom: 8,
  };

  const emptyStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: 48,
    color: '#999',
    fontSize: 14,
  };

  const statusStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-block',
    fontSize: 12,
    padding: '2px 8px',
    borderRadius: 4,
    fontWeight: 500,
    background: active ? '#e6f7e6' : '#fff0f0',
    color: active ? '#52c41a' : '#ff4d4f',
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div style={containerStyle}>
      <div style={rowStyle}>
        {/* Left: Invite Management */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>邀请管理</div>

          {/* Generate invite code */}
          <div style={sectionStyle}>
            <div style={labelStyle}>生成邀请码</div>
            <Button
              type="primary"
              onClick={handleGenerate}
              loading={generating}
              block
            >
              生成邀请码
            </Button>
            {inviteCode && (
              <div style={{ marginTop: 16 }}>
                <div style={inviteCodeDisplayStyle}>{inviteCode}</div>
                <Button
                  icon={<CopyOutlined />}
                  onClick={handleCopy}
                  block
                >
                  复制邀请码
                </Button>
              </div>
            )}
          </div>

          {/* Accept invite */}
          <div style={sectionStyle}>
            <div style={labelStyle}>接受邀请</div>
            <Input
              placeholder="请输入8位邀请码"
              value={acceptCode}
              onChange={(e) => setAcceptCode(e.target.value.toUpperCase())}
              maxLength={8}
              style={{ marginBottom: 8, textTransform: 'uppercase' }}
            />
            <Button
              type="primary"
              onClick={handleAccept}
              loading={accepting}
              block
            >
              接受邀请
            </Button>
          </div>
        </div>

        {/* Right: Partner List */}
        <div style={cardStyle}>
          <div style={cardTitleStyle}>共享伙伴</div>
          {relationships.length === 0 ? (
            <div style={emptyStyle}>暂无共享伙伴</div>
          ) : (
            relationships.map((rel) => {
              const isActive = rel.status === 'active';
              return (
                <div key={rel.id} style={partnerCardStyle}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <div style={partnerNameStyle}>{rel.partner_name}</div>
                      <div style={metaStyle}>
                        <span style={statusStyle(isActive)}>
                          {isActive ? '已激活' : '已撤回'}
                        </span>
                        <span style={{ marginLeft: 8 }}>
                          邀请于 {formatDate(rel.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={scopeLabelStyle}>共享范围：</div>
                    <Checkbox
                      checked={rel.scope.expenses}
                      onChange={(e) =>
                        handleScopeChange(rel.id, 'expenses', e.target.checked)
                      }
                    >
                      支出
                    </Checkbox>
                    <Checkbox
                      checked={rel.scope.budgets}
                      onChange={(e) =>
                        handleScopeChange(rel.id, 'budgets', e.target.checked)
                      }
                      style={{ marginLeft: 16 }}
                    >
                      预算
                    </Checkbox>
                    <Checkbox
                      checked={rel.scope.deposits}
                      onChange={(e) =>
                        handleScopeChange(rel.id, 'deposits', e.target.checked)
                      }
                      style={{ marginLeft: 16 }}
                    >
                      储蓄
                    </Checkbox>
                  </div>

                  <Button
                    danger
                    size="small"
                    onClick={() => handleDelete(rel.id)}
                  >
                    解除共享
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
