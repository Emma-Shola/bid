import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";

import { AuthProvider } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Auth pages (always needed — keep eager)
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import PendingApproval from "./pages/auth/PendingApproval";

// Role-specific pages — lazy-loaded so each bundle is only fetched when visited
const BidderDashboard = lazy(() => import("./pages/bidder/Dashboard"));
const BidderWorkspaces = lazy(() => import("./pages/bidder/Workspaces"));
const ResumeSetup = lazy(() => import("./pages/bidder/ResumeSetup"));
const ResumeGenerator = lazy(() => import("./pages/bidder/Resume"));

const ManagerOverview = lazy(() => import("./pages/manager/Overview"));
const ManagerApplications = lazy(() => import("./pages/manager/Applications"));
const Payments = lazy(() => import("./pages/manager/Payments"));
const Analytics = lazy(() => import("./pages/manager/Analytics"));
const Bidders = lazy(() => import("./pages/manager/Bidders"));
const BidderDetail = lazy(() => import("./pages/manager/BidderDetail"));
const ManagerResumes = lazy(() => import("./pages/manager/Resumes"));
const ManagerResumeActivity = lazy(() => import("./pages/manager/ResumeActivity"));

const AdminOverview = lazy(() => import("./pages/admin/Overview"));
const Approvals = lazy(() => import("./pages/admin/Approvals"));
const Users = lazy(() => import("./pages/admin/Users"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const Jobs = lazy(() => import("./pages/admin/Jobs"));
const ResumeInstructionBuilder = lazy(() => import("./pages/admin/ResumeInstructionBuilder"));
const TimeTracking = lazy(() => import("./pages/admin/TimeTracking"));
const BidderBids = lazy(() => import("./pages/admin/BidderBids"));
const BidderBidsDetail = lazy(() => import("./pages/admin/BidderBidsDetail"));

const Notifications = lazy(() => import("./pages/Notifications"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

function PageLoader() {
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
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
                  <Route path="/bidder/workspaces" element={<BidderWorkspaces />} />
                  <Route path="/bidder/resume" element={<ResumeSetup />} />
                  <Route path="/bidder/resume/queue" element={<ResumeGenerator />} />
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
                  <Route path="/manager/bidders/:id" element={<BidderDetail />} />
                  <Route path="/manager/resumes" element={<ManagerResumes />} />
                  <Route path="/manager/resume-activity" element={<ManagerResumeActivity />} />
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
                  <Route path="/admin/resume-builder" element={<ResumeInstructionBuilder />} />
                  <Route path="/admin/time-tracking" element={<TimeTracking />} />
                  <Route path="/admin/bidder-bids" element={<BidderBids />} />
                  <Route path="/admin/bidder-bids/:id" element={<BidderBidsDetail />} />
                  <Route path="/admin/notifications" element={<Notifications />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
