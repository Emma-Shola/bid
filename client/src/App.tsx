import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import PendingApproval from "./pages/auth/PendingApproval";

import BidderDashboard from "./pages/bidder/Dashboard";
import BidderApplications from "./pages/bidder/Applications";
import ApplicationForm from "./pages/bidder/ApplicationForm";
import ApplicationDetail from "./pages/bidder/ApplicationDetail";
import ResumeGenerator from "./pages/bidder/Resume";
import Notifications from "./pages/Notifications";

import ManagerOverview from "./pages/manager/Overview";
import ManagerApplications from "./pages/manager/Applications";
import Payments from "./pages/manager/Payments";
import Analytics from "./pages/manager/Analytics";
import Bidders from "./pages/manager/Bidders";
import ManagerResumes from "./pages/manager/Resumes";

import AdminOverview from "./pages/admin/Overview";
import Approvals from "./pages/admin/Approvals";
import Users from "./pages/admin/Users";
import AuditLogs from "./pages/admin/AuditLogs";
import Jobs from "./pages/admin/Jobs";
import LiveMonitor from "./pages/admin/LiveMonitor";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/pending" element={<PendingApproval />} />

            {/* Bidder */}
            <Route
              element={
                <RequireAuth roles={["bidder"]}>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/bidder" element={<BidderDashboard />} />
              <Route path="/bidder/applications" element={<BidderApplications />} />
              <Route path="/bidder/applications/new" element={<ApplicationForm mode="create" />} />
              <Route path="/bidder/applications/:id" element={<ApplicationDetail />} />
              <Route path="/bidder/applications/:id/edit" element={<ApplicationForm mode="edit" />} />
              <Route path="/bidder/resume" element={<ResumeGenerator />} />
              <Route path="/bidder/notifications" element={<Notifications />} />
            </Route>

            {/* Manager */}
            <Route
              element={
                <RequireAuth roles={["manager"]}>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/manager" element={<ManagerOverview />} />
              <Route path="/manager/applications" element={<ManagerApplications />} />
              <Route path="/manager/payments" element={<Payments />} />
              <Route path="/manager/analytics" element={<Analytics />} />
              <Route path="/manager/bidders" element={<Bidders />} />
              <Route path="/manager/resumes" element={<ManagerResumes />} />
              <Route path="/manager/notifications" element={<Notifications />} />
            </Route>

            {/* Admin */}
            <Route
              element={
                <RequireAuth roles={["admin"]}>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/admin" element={<AdminOverview />} />
              <Route path="/admin/approvals" element={<Approvals />} />
              <Route path="/admin/users" element={<Users />} />
              <Route path="/admin/audit" element={<AuditLogs />} />
              <Route path="/admin/jobs" element={<Jobs />} />
              <Route path="/admin/monitor" element={<LiveMonitor />} />
              <Route path="/admin/notifications" element={<Notifications />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
