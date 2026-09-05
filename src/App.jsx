import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./app/AuthProvider";
import { RequireRole } from "./app/RequireRole";
import { Layout } from "./components/Layout";
import { PortalLayout } from "./components/PortalLayout";
import { Spinner, ToastProvider } from "./components/ui";
import { LoginPage } from "./features/auth/LoginPage";
import { DemoPage } from "./features/auth/DemoPage";
import { AccessRequestsPage } from "./features/admin/AccessRequestsPage";
import { OutboxPage } from "./features/admin/OutboxPage";
import { ApprovalsPage } from "./features/approvals/ApprovalsPage";
import { RealtimeProvider } from "./app/RealtimeProvider";
import { NoAccessPage, NotFoundPage } from "./features/misc/NoAccessPage";
import { BackendPage, DashboardPage, PortalPage } from "./features/placeholders/Pages";
import { BillingPage } from "./features/billing/BillingPage";
import { InvoiceRecordPage } from "./features/billing/InvoiceRecordPage";
import { SubscriptionRecordPage } from "./features/billing/SubscriptionRecordPage";
import { FulfilmentPage } from "./features/fulfilment/FulfilmentPage";
import { FulfilmentRecordPage } from "./features/fulfilment/FulfilmentRecordPage";
import { QuotationsListPage } from "./features/quotations/QuotationsListPage";
import { QuotationBuilderPage } from "./features/quotations/QuotationBuilderPage";
import { PipelinePage } from "./features/quotations/PipelinePage";
import { CustomerDetailPage } from "./features/catalogue/CustomerDetailPage";
import { ProductDetailPage } from "./features/catalogue/ProductDetailPage";
import { ROLES } from "./lib/constants";

const STAFF = [ROLES.ADMIN, ROLES.SALES_REP, ROLES.SALES_MANAGER, ROLES.FINANCE];

// Sends each role to its home screen; customers never land in the workspace.
function HomeRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <Spinner label="Starting DealFlow360" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === ROLES.CUSTOMER ? "/portal" : "/quotations"} replace />;
}

export function App() {
  return (
    <ToastProvider>
    <RealtimeProvider>
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      {/* The demo has its own address so it survives a refresh and can be linked to. */}
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/no-access" element={<NoAccessPage />} />

      {/* Internal sales workspace */}
      <Route
        element={
          <RequireRole roles={STAFF}>
            <Layout />
          </RequireRole>
        }
      >
        <Route path="/quotations" element={<QuotationsListPage />} />
        <Route path="/quotations/:id" element={<QuotationBuilderPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route
          path="/pipeline"
          element={
            <RequireRole roles={[ROLES.ADMIN, ROLES.SALES_REP, ROLES.SALES_MANAGER]}>
              <PipelinePage />
            </RequireRole>
          }
        />
        <Route
          path="/approvals"
          element={
            <RequireRole roles={[ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.FINANCE]}>
              <ApprovalsPage />
            </RequireRole>
          }
        />
        <Route
          path="/fulfilment"
          element={
            <RequireRole roles={[ROLES.ADMIN, ROLES.SALES_REP, ROLES.FINANCE]}>
              <FulfilmentPage />
            </RequireRole>
          }
        />
        <Route
          path="/fulfilment/:id"
          element={
            <RequireRole roles={[ROLES.ADMIN, ROLES.SALES_REP, ROLES.FINANCE]}>
              <FulfilmentRecordPage />
            </RequireRole>
          }
        />
        {/* A rep reaches billing for their own orders; the server scopes the
            rows and refuses anyone else's. Changing any of it is finance work. */}
        <Route
          path="/billing"
          element={
            <RequireRole roles={[ROLES.ADMIN, ROLES.SALES_REP, ROLES.FINANCE]}>
              <BillingPage />
            </RequireRole>
          }
        />
        <Route
          path="/billing/invoices/:id"
          element={
            <RequireRole roles={[ROLES.ADMIN, ROLES.SALES_REP, ROLES.FINANCE]}>
              <InvoiceRecordPage />
            </RequireRole>
          }
        />
        <Route
          path="/billing/subscriptions/:id"
          element={
            <RequireRole roles={[ROLES.ADMIN, ROLES.SALES_REP, ROLES.FINANCE]}>
              <SubscriptionRecordPage />
            </RequireRole>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireRole roles={[ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.FINANCE]}>
              <DashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/access-requests"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <AccessRequestsPage />
            </RequireRole>
          }
        />
        <Route
          path="/outbox"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <OutboxPage />
            </RequireRole>
          }
        />
        <Route
          path="/backend"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <BackendPage />
            </RequireRole>
          }
        />
      </Route>

      {/* Customer portal — a separate shell, not the workspace with items hidden */}
      <Route
        element={
          <RequireRole roles={[ROLES.CUSTOMER]}>
            <PortalLayout />
          </RequireRole>
        }
      >
        <Route path="/portal" element={<PortalPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </RealtimeProvider>
    </ToastProvider>
  );
}
