import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { setupApiClient } from '@/lib/api-setup';

// Initialize API client (auth token getter)
setupApiClient();

// Create query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Lazy load pages
import Login from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import Candidates from '@/pages/candidates';
import NewCandidate from '@/pages/candidates/new';
import CandidateDetail from '@/pages/candidates/[id]';
import Employees from '@/pages/employees';
import Doctors from '@/pages/doctors';
import MyTasks from '@/pages/my-tasks';
import TaskDetail from '@/pages/my-tasks/[stepId]';
import SettingsPage from '@/pages/settings';
import OfferPublic from '@/pages/public/offer';
import OfferOtp from '@/pages/public/offer-otp';
import StatusPublic from '@/pages/public/status';
import NotFound from '@/pages/not-found';

// Doctor branch
import DoctorProfilePage from '@/pages/doctor-profile/[routingSheetId]';

// Termination / offboarding
import TerminationList from '@/pages/termination';
import NewTermination from '@/pages/termination/new';
import TerminationDetail from '@/pages/termination/[id]';
import TerminationTasks from '@/pages/termination-tasks';
import TerminationTaskDetail from '@/pages/termination-tasks/[stepId]';
import TerminationStatusPublic from '@/pages/public/termination-status';

// Admin panel
import AdminHub from '@/pages/admin/index';
import AdminUsers from '@/pages/admin/users';
import AdminBranches from '@/pages/admin/branches';
import AdminPositions from '@/pages/admin/positions';
import AdminEmailTemplates from '@/pages/admin/email-templates';
import AdminIntegrations from '@/pages/admin/integrations';
import AdminAuditLog from '@/pages/admin/audit-log';
import AdminNotificationLog from '@/pages/admin/notification-log';
import AdminTerminationRestore from '@/pages/admin/termination-restore';
import AdminStepMeta from '@/pages/admin/step-meta';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Switch>
              {/* Public Routes */}
              <Route path="/login" component={Login} />
              <Route path="/offer/:token" component={OfferPublic} />
              <Route path="/offer/:token/otp" component={OfferOtp} />
              <Route path="/status/:token" component={StatusPublic} />
              <Route path="/termination-status/:token" component={TerminationStatusPublic} />

              {/* Protected Routes */}
              <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
              <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
              <Route path="/candidates" component={() => <ProtectedRoute component={Candidates} />} />
              <Route path="/candidates/new" component={() => <ProtectedRoute component={NewCandidate} />} />
              <Route path="/candidates/:id" component={() => <ProtectedRoute component={CandidateDetail} />} />
              <Route path="/employees" component={() => <ProtectedRoute component={Employees} />} />
              <Route path="/doctors" component={() => <ProtectedRoute component={Doctors} />} />
              <Route path="/my-tasks" component={() => <ProtectedRoute component={MyTasks} />} />
              <Route path="/my-tasks/:stepId" component={() => <ProtectedRoute component={TaskDetail} />} />
              <Route path="/settings" component={() => <ProtectedRoute component={SettingsPage} />} />

              {/* Doctor branch */}
              <Route path="/doctor-profile/:routingSheetId" component={() => <ProtectedRoute component={DoctorProfilePage} />} />

              {/* Termination / offboarding */}
              <Route path="/termination" component={() => <ProtectedRoute component={TerminationList} />} />
              <Route path="/termination/new" component={() => <ProtectedRoute component={NewTermination} />} />
              <Route path="/termination/:id" component={() => <ProtectedRoute component={TerminationDetail} />} />
              <Route path="/termination-tasks" component={() => <ProtectedRoute component={TerminationTasks} />} />
              <Route path="/termination-tasks/:stepId" component={() => <ProtectedRoute component={TerminationTaskDetail} />} />

              {/* Admin panel */}
              <Route path="/admin" component={() => <ProtectedRoute component={AdminHub} />} />
              <Route path="/admin/users" component={() => <ProtectedRoute component={AdminUsers} />} />
              <Route path="/admin/branches" component={() => <ProtectedRoute component={AdminBranches} />} />
              <Route path="/admin/positions" component={() => <ProtectedRoute component={AdminPositions} />} />
              <Route path="/admin/email-templates" component={() => <ProtectedRoute component={AdminEmailTemplates} />} />
              <Route path="/admin/integrations" component={() => <ProtectedRoute component={AdminIntegrations} />} />
              <Route path="/admin/audit-log" component={() => <ProtectedRoute component={AdminAuditLog} />} />
              <Route path="/admin/notification-log" component={() => <ProtectedRoute component={AdminNotificationLog} />} />
              <Route path="/admin/termination-restore" component={() => <ProtectedRoute component={AdminTerminationRestore} />} />
              <Route path="/admin/step-meta" component={() => <ProtectedRoute component={AdminStepMeta} />} />

              <Route component={NotFound} />
            </Switch>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
