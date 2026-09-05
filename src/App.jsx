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
import { PortalSettingsPage } from "./features/admin/PortalSettingsPage";
import { ApprovalsPage } from "./features/approvals/ApprovalsPage";
import { RealtimeProvider } from "./app/RealtimeProvider";
import { NoAccessPage, NotFoundPage } from "./features/misc/NoAccessPage";
import { ConfigurationPage } from "./features/admin/ConfigurationPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { CompanySettingsPage } from "./features/admin/CompanySettingsPage";
import { MailSettingsPage } from "./features/admin/MailSettingsPage";
import { CeilingsPage } from "./features/admin/CeilingsPage";
import { DealHealthSettingsPage } from "./features/admin/DealHealthSettingsPage";
import { ApprovalRulesPage } from "./features/admin/ApprovalRulesPage";
import { PriceListsPage } from "./features/admin/PriceListsPage";
import { WarehousesPage } from "./features/admin/WarehousesPage";
import { CustomersListPage } from "./features/catalogue/CustomersListPage";
import { PortalCataloguePage } from "./features/portal/PortalCataloguePage";
import { PortalRequestPage } from "./features/portal/PortalRequestPage";
import { PortalQuotationsPage } from "./features/portal/PortalQuotationsPage";
import { PortalQuotationPage } from "./features/portal/PortalQuotationPage";
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
import { ProductsListPage } from "./features/catalogue/ProductsListPage";
import { ROLES } from "./lib/constants";

const STAFF = [ROLES.ADMIN, ROLES.SALES_REP, ROLES.SALES_MANAGER, ROLES.FINANCE];

// Sends each role to its home screen; customers never land in the workspace.
function HomeRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <Spinner label="Starting DealFlow360" />;
  if (!user) return <Navigate to="/login" replace />;
  // Staff land on the dashboard: it answers "what needs me first" before
  // showing anything else. Customers never enter the workspace.
  return <Navigate to={user.role === ROLES.CUSTOMER ? "/portal" : "/dashboard"} replace />;
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
        <Route
          path="/products"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <ProductsListPage />
            </RequireRole>
          }
        />
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
        {/* Every member of staff has a dashboard; the server decides whose
            deals and which figures they are answered with. */}
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/customers"
          element={
            <RequireRole roles={[ROLES.ADMIN, ROLES.SALES_MANAGER]}>
              <CustomersListPage />
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
          path="/portal-settings"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <PortalSettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="/backend"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <ConfigurationPage />
            </RequireRole>
          }
        />

        {/* Configuration: the numbers and records the rules read from. */}
        <Route
          path="/company"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <CompanySettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="/mail-settings"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <MailSettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="/ceilings"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <CeilingsPage />
            </RequireRole>
          }
        />
        <Route
          path="/deal-health-settings"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <DealHealthSettingsPage />
            </RequireRole>
          }
        />
        <Route
          path="/approval-rules"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <ApprovalRulesPage />
            </RequireRole>
          }
        />
        <Route
          path="/price-lists"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <PriceListsPage />
            </RequireRole>
          }
        />
        <Route
          path="/warehouses"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <WarehousesPage />
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
        <Route path="/portal" element={<PortalCataloguePage />} />
        <Route path="/portal/request" element={<PortalRequestPage />} />
        <Route path="/portal/quotations" element={<PortalQuotationsPage />} />
        <Route path="/portal/quotations/:id" element={<PortalQuotationPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </RealtimeProvider>
    </ToastProvider>
  );
}
