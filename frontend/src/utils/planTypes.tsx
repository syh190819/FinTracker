import type { ReactNode } from 'react';
import {
  AccountBookOutlined,
  BankOutlined,
  CheckSquareOutlined,
} from '@ant-design/icons';

export interface PlanTypeConfig {
  label: string;
  icon: ReactNode;
  color: string;
  desc: string;
}

export const PLAN_TYPE_CONFIG: Record<string, PlanTypeConfig> = {
  budget: {
    label: '预算计划',
    icon: <AccountBookOutlined />,
    color: 'blue',
    desc: '关联收入/支出，按目标统计',
  },
  deposit: {
    label: '存款计划',
    icon: <BankOutlined />,
    color: 'geekblue',
    desc: '关联存取流水，按余额统计',
  },
  todo: {
    label: '待办计划',
    icon: <CheckSquareOutlined />,
    color: 'green',
    desc: '关联分级待办，按完成率统计',
  },
};

export const PLAN_TYPES = Object.keys(PLAN_TYPE_CONFIG);
