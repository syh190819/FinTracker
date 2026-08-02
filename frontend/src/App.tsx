import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ExpensePage from './pages/ExpensePage';
import BudgetPage from './pages/BudgetPage';
import DepositPage from './pages/DepositPage';
import StatisticsPage from './pages/StatisticsPage';
import SharingPage from './pages/SharingPage';
import WorkbenchPage from './pages/WorkbenchPage';
import TodosPage from './pages/TodosPage';
import PlansPage from './pages/PlansPage';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<WorkbenchPage />} />
        <Route path="expenses" element={<ExpensePage />} />
        <Route path="budgets" element={<BudgetPage />} />
        <Route path="deposits" element={<DepositPage />} />
        <Route path="statistics" element={<StatisticsPage />} />
        <Route path="sharing" element={<SharingPage />} />
        <Route path="todos" element={<TodosPage />} />
        <Route path="plans" element={<PlansPage />} />
      </Route>
    </Routes>
  );
}

export default App;
