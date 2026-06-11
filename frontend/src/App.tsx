import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProviderRuntimeProvider } from "@/hooks/use-provider-models";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import NotFound from "@/pages/not-found";
import Chat from "@/pages/chat";
import AuthPage from "@/pages/auth";
import { Switch, Route, useLocation } from "wouter";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,                     // 1 retry max (not 3)
      retryDelay: 1_000,            // 1 second flat (not exponential)
      staleTime: 10_000,            // 10s stale time — prevents over-fetching
      refetchOnWindowFocus: false,  // Don't re-fetch every time user tabs back
    },
    mutations: {
      retry: 0,                     // NEVER retry mutations — prevents duplicate inserts
    },
  },
});


function AnimatedRoutes() {
  const [location] = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        className="min-h-screen bg-background text-foreground font-sans antialiased"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <ProviderRuntimeProvider>
          <Switch location={location}>
            <Route path="/" component={() => (
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            )} />
            <Route path="/chat" component={() => (
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            )} />
            <Route path="/auth" component={AuthPage} />
            <Route component={NotFound} />
          </Switch>
        </ProviderRuntimeProvider>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AnimatedRoutes />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
