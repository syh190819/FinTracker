import { useState, useEffect } from 'react';
import { Button, Modal, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import BudgetList from '../components/BudgetList';
import CategoryManager from '../components/CategoryManager';
import { budgetApi } from '../services/budgetApi';
import { categoryApi } from '../services/categoryApi';
import { currentMonthStr, daysInMonth, formatMoney } from '../utils/helpers';
import { useDialog } from '../components/CustomDialog';
import type { Budget, Category } from '../types/api';

const BudgetPage: React.FC = () => {
  const { showDialog, dialog } = useDialog();
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgetMonth, setBudgetMonth] = useState(currentMonthStr());
  const [budgetCategory, setBudgetCategory] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [splitByDay, setSplitByDay] = useState('no');

  const fetchBudgets = async () => {
    try {
      const data = await budgetApi.list();
      setBudgets(data);
    } catch {
      message.error('获取预算列表失败');
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await categoryApi.list();
      setCategories(data);
    } catch {
      message.error('获取品类列表失败');
    }
  };

  useEffect(() => {
    fetchBudgets();
    fetchCategories();
  }, []);

  const categoryNames = categories.map(c => c.name);

  const handleSetBudget = async () => {
    if (!budgetMonth) {
      showDialog({ mode: 'alert', title: '提示', message: '请选择目标月份' });
      return;
    }
    if (!budgetCategory) {
      showDialog({ mode: 'alert', title: '提示', message: '请选择品类' });
      return;
    }
    const amt = parseFloat(budgetAmount);
    if (!amt || amt <= 0) {
      showDialog({ mode: 'alert', title: '提示', message: '请输入有效预算金额' });
      return;
    }
    try {
      await budgetApi.create({
        month: budgetMonth,
        category: budgetCategory,
        amount: amt,
        split_by_day: splitByDay === 'yes',
      });
      message.success('预算已保存');
      setBudgetAmount('');
      setSplitByDay('no');
      setBudgetModalOpen(false);
      fetchBudgets();
    } catch {
      message.error('保存预算失败');
    }
  };

  const handleEditBudget = async (id: number, amount: number, splitByDayVal: boolean) => {
    try {
      await budgetApi.update(id, { amount, split_by_day: splitByDayVal });
      message.success('预算已更新');
      fetchBudgets();
    } catch {
      message.error('更新预算失败');
    }
  };

  const handleDeleteBudget = async (id: number) => {
    try {
      await budgetApi.delete(id);
      message.success('预算已删除');
      fetchBudgets();
    } catch {
      message.error('删除预算失败');
    }
  };

  const handleDeleteAllInMonth = async (month: string) => {
    try {
      const toDelete = budgets.filter(b => b.month === month);
      for (const b of toDelete) {
        await budgetApi.delete(b.id);
      }
      message.success(`${month} 预算已全部删除`);
      fetchBudgets();
    } catch {
      message.error('删除预算失败');
    }
  };

  const handleCopyBudget = async (sourceMonth: string, targetMonth: string) => {
    try {
      const srcBudgets = budgets.filter(b => b.month === sourceMonth);
      for (const b of srcBudgets) {
        await budgetApi.create({
          month: targetMonth,
          category: b.category,
          amount: b.amount,
          split_by_day: b.split_by_day,
        });
      }
      message.success(`已从 ${sourceMonth} 复制预算到 ${targetMonth}`);
      fetchBudgets();
    } catch {
      message.error('复制预算失败');
    }
  };

  const handleAddCategory = async (name: string) => {
    try {
      await categoryApi.create({ name });
      message.success('品类已添加');
      fetchCategories();
    } catch {
      message.error('添加品类失败');
    }
  };

  const handleDeleteCategory = async (id: number) => {
    try {
      await categoryApi.delete(id);
      message.success('品类已删除');
      fetchCategories();
    } catch {
      message.error('删除品类失败');
    }
  };

  const handleToggleExclude = async (id: number, excluded: boolean) => {
    try {
      await categoryApi.update(id, { excluded: !excluded });
      fetchCategories();
    } catch {
      message.error('更新品类失败');
    }
  };

  const dailyPreview = (() => {
    const amt = parseFloat(budgetAmount);
    if (!budgetMonth || !amt || amt <= 0) return '—';
    if (splitByDay === 'yes') {
      return formatMoney(amt / daysInMonth(budgetMonth));
    }
    return `${formatMoney(amt)} (按月)`;
  })();

  return (
    <div>
      {dialog}
      {/* 预算操作区 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setBudgetModalOpen(true)}>
          设置预算
        </Button>
        <Button icon={<PlusOutlined />} onClick={() => setCategoryModalOpen(true)}>
          品类管理
        </Button>
      </div>

      {/* Budget list */}
      <BudgetList
        budgets={budgets}
        categories={categories}
        onEditBudget={handleEditBudget}
        onDeleteBudget={handleDeleteBudget}
        onDeleteAllInMonth={handleDeleteAllInMonth}
        onCopyBudget={handleCopyBudget}
        showDialog={showDialog}
      />

      {/* 设置预算弹窗 */}
      <Modal
        title="设置每月预算"
        open={budgetModalOpen}
        onOk={handleSetBudget}
        onCancel={() => setBudgetModalOpen(false)}
        okText="保存预算"
        cancelText="取消"
        destroyOnHidden
      >
        <div className="form-row">
          <div className="form-group">
            <label>目标月份</label>
            <input type="month" value={budgetMonth} onChange={e => setBudgetMonth(e.target.value)} />
          </div>
          <div className="form-group">
            <label>品类</label>
            <select value={budgetCategory} onChange={e => setBudgetCategory(e.target.value)} required>
              <option value="" disabled>请选择品类</option>
              {categoryNames.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>每月预算 (¥)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={budgetAmount}
              onChange={e => setBudgetAmount(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>是否按天拆分</label>
            <select value={splitByDay} onChange={e => setSplitByDay(e.target.value)}>
              <option value="no">否</option>
              <option value="yes">是</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <span style={{ color: 'var(--text-light)', fontSize: 12 }}>{dailyPreview}</span>
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-light)', margin: 0 }}>
          每月预算将按该月天数自动切分为每日预算
        </p>
      </Modal>

      {/* 品类管理弹窗 */}
      <Modal
        title="品类管理"
        open={categoryModalOpen}
        onCancel={() => setCategoryModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <CategoryManager
          categories={categories}
          onAdd={handleAddCategory}
          onDelete={handleDeleteCategory}
          onToggleExclude={handleToggleExclude}
          showDialog={showDialog}
        />
      </Modal>
    </div>
  );
};

export default BudgetPage;
