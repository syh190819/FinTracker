import { useState } from 'react';
import type { Category } from '../types/api';
import type { ShowDialogFn } from './CustomDialog';

interface Props {
  categories: Category[];
  onAdd: (name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onToggleExclude: (id: number, excluded: boolean) => Promise<void>;
  showDialog: ShowDialogFn;
}

const CategoryManager: React.FC<Props> = ({
  categories, onAdd, onDelete, onToggleExclude, showDialog,
}) => {
  const [showInline, setShowInline] = useState(false);
  const [newName, setNewName] = useState('');

  const summaryExcludeCategories = categories.filter(c => c.excluded).map(c => c.name);
  const categoryNames = categories.map(c => c.name);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    if (categoryNames.includes(name)) {
      showDialog({ mode: 'alert', title: '提示', message: '该品类已存在' });
      return;
    }
    onAdd(name);
    setNewName('');
    setShowInline(false);
  };

  const handleDelete = async (cat: Category) => {
    const ok = await showDialog({
      mode: 'confirm',
      title: '删除品类',
      message: `确定删除品类「${cat.name}」？相关的预算设置也将被清除。`,
    });
    if (ok) onDelete(cat.id);
  };

  return (
    <div style={{ marginTop: 'calc(16px * var(--S))', paddingTop: 'calc(14px * var(--S))', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'calc(8px * var(--S))' }}>
        <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-light)' }}>
          品类管理
        </label>
        <span
          className="btn btn-sm btn-primary"
          style={{ cursor: 'pointer' }}
          onClick={() => setShowInline(v => !v)}
        >
          + 新增品类
        </span>
      </div>

      {showInline && (
        <div style={{ marginBottom: 10 }}>
          <input
            type="text"
            placeholder="输入新品类名称"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{ width: '100%', padding: 'calc(8px * var(--S)) calc(12px * var(--S))', border: '1px solid var(--border)', borderRadius: 4, marginBottom: 'calc(6px * var(--S))', fontSize: 13 }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={handleAdd}>添加</button>
            <button className="btn btn-sm btn-outline" onClick={() => { setShowInline(false); setNewName(''); }}>取消</button>
          </div>
        </div>
      )}

      <div className="cat-tags">
        {categories.map(c => {
          const isExcluded = c.excluded;
          return (
            <span
              key={c.id}
              className={`cat-tag${isExcluded ? ' selected' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => onToggleExclude(c.id, c.excluded)}
              title={isExcluded ? '已排除统计，点击取消' : '点击设为排除统计'}
            >
              {c.name}{isExcluded ? ' ☆' : ''}
              <span
                style={{ cursor: 'pointer', marginLeft: 4, opacity: 0.7 }}
                onClick={e => { e.stopPropagation(); handleDelete(c); }}
                title="删除品类"
              >
                &times;
              </span>
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>
        点击品类切换「排除统计」状态（带☆），排除统计的品类将在概览括号中排除计算
      </div>
    </div>
  );
};

export default CategoryManager;
