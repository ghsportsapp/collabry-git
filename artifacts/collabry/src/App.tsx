import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrandAuthProvider } from "@/contexts/BrandAuthContext";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { CreatorAuthProvider } from "@/contexts/CreatorAuthContext";
import { queryClient } from "@/lib/queryClient";
import TopProgressBar from "@/components/TopProgressBar";
import PageLoader from "@/components/PageLoader";
import ScrollToTop from "@/components/ScrollToTop";
import PixelPageViews from "@/components/PixelPageViews";
import DataLayerPageViews from "@/components/DataLayerPageViews";
import AdminProtectedRoute from "@/components/AdminProtectedRoute";
import { InstallPrompt } from "@/components/InstallPrompt";
import { BrandFcmAutoRegister, CreatorFcmAutoRegister } from "@/components/FcmAutoRegister";

const LandingPage = lazy(() => import("@/pages/LandingPage"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));
const AdminLandingEditor = lazy(() => import("@/pages/AdminLandingEditor"));
const AdminBrandOnboarding = lazy(() => import("@/pages/AdminBrandOnboarding"));
const AdminCreditsManagement = lazy(() => import("@/pages/AdminCreditsManagement"));
const AdminCategories = lazy(() => import("@/pages/AdminCategories"));
const AdminLegalPages = lazy(() => import("@/pages/AdminLegalPages"));
const AdminCreatorOnboarding = lazy(() => import("@/pages/AdminCreatorOnboarding"));
const AdminPricing = lazy(() => import("@/pages/AdminPricing"));
const TermsAndConditions = lazy(() => import("@/pages/TermsAndConditions"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const AboutUsPage = lazy(() => import("@/pages/AboutUs"));
const AdminAboutUs = lazy(() => import("@/pages/AdminAboutUs"));
const BrandSignup = lazy(() => import("@/pages/BrandSignup"));
const BrandLogin = lazy(() => import("@/pages/BrandLogin"));
const ForgotPasswordBrand = lazy(() => import("@/pages/ForgotPasswordBrand"));
const ForgotPasswordCreator = lazy(() => import("@/pages/ForgotPasswordCreator"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const BrandHome = lazy(() => import("@/pages/BrandHome"));
const BrandProfile = lazy(() => import("@/pages/BrandProfile"));
const BrandSearch = lazy(() => import("@/pages/BrandSearch"));
const BrandCredits = lazy(() => import("@/pages/BrandCredits"));
const BrandCreatorProfile = lazy(() => import("@/pages/BrandCreatorProfile"));
const BrandMatchmaking = lazy(() => import("@/pages/BrandMatchmaking"));
const BrandMatchmakingResults = lazy(() => import("@/pages/BrandMatchmakingResults"));
const AdminMatchmaking = lazy(() => import("@/pages/AdminMatchmaking"));
const BrandCampaigns = lazy(() => import("@/pages/BrandCampaigns"));
const BrandCreateCampaign = lazy(() => import("@/pages/BrandCreateCampaign"));
const BrandCreateBarter = lazy(() => import("@/pages/BrandCreateBarter"));
const BrandCampaignDetail = lazy(() => import("@/pages/BrandCampaignDetail"));
const BrandBarterDetail = lazy(() => import("@/pages/BrandBarterDetail"));
const CreatorCampaigns = lazy(() => import("@/pages/CreatorCampaigns"));
const CreatorCampaignDetail = lazy(() => import("@/pages/CreatorCampaignDetail"));
const AdminCampaignsPage = lazy(() => import("@/pages/AdminCampaigns"));
const AdminBarterPage = lazy(() => import("@/pages/AdminBarter"));
const AdminPlatformSettings = lazy(() => import("@/pages/AdminPlatformSettings"));
const AdminCampaignSettings = lazy(() => import("@/pages/AdminCampaignSettings"));
const AdminDealSettings = lazy(() => import("@/pages/AdminDealSettings"));
const AdminCampaignManagement = lazy(() => import("@/pages/AdminCampaignManagement"));
const AdminDealManagement = lazy(() => import("@/pages/AdminDealManagement"));
const AdminDeals = lazy(() => import("@/pages/AdminDeals"));
const CreatorSignup = lazy(() => import("@/pages/CreatorSignup"));
const CreatorLogin = lazy(() => import("@/pages/CreatorLogin"));
const HomeCreator = lazy(() => import("@/pages/HomeCreator"));
const CreatorEarningsHistory = lazy(() => import("@/pages/CreatorEarningsHistory"));
const CreatorProfile = lazy(() => import("@/pages/CreatorProfile"));
const CreatorNotifications = lazy(() => import("@/pages/CreatorNotifications"));
const CreatorRequests = lazy(() => import("@/pages/CreatorRequests"));
const CreatorDeals = lazy(() => import("@/pages/CreatorDeals"));
const BrandDeals = lazy(() => import("@/pages/BrandDeals"));
const BrandNotifications = lazy(() => import("@/pages/BrandNotifications"));
const BrandUnlockedProfiles = lazy(() => import("@/pages/BrandUnlockedProfiles"));
const BrandPaymentReturn = lazy(() => import("@/pages/BrandPaymentReturn"));
const BrandLandingPage = lazy(() => import("@/pages/BrandLandingPage"));
const AdminBrandLandingEditor = lazy(() => import("@/pages/AdminBrandLandingEditor"));
const CreatorLandingPage = lazy(() => import("@/pages/CreatorLandingPage"));
const AdminCreatorLandingEditor = lazy(() => import("@/pages/AdminCreatorLandingEditor"));
const AdminLandingVideos = lazy(() => import("@/pages/AdminLandingVideos"));
const NotFound = lazy(() => import("@/pages/not-found"));

function AR({ path, component: Comp }: { path: string; component: React.ComponentType<any> }) {
  return (
    <Route path={path}>
      {(params: any) => (
        <AdminProtectedRoute>
          <Comp {...params} />
        </AdminProtectedRoute>
      )}
    </Route>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/signup-brand" component={BrandSignup} />
      <Route path="/login-brand" component={BrandLogin} />
      <Route path="/forgot-password-brand" component={ForgotPasswordBrand} />
      <Route path="/forgot-password-creator" component={ForgotPasswordCreator} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/home-brand" component={BrandHome} />
      <Route path="/home-brand/profile" component={BrandProfile} />
      <Route path="/home-brand/search" component={BrandSearch} />
      <Route path="/home-brand/search/creator/:id" component={BrandCreatorProfile} />
      <Route path="/home-brand/matchmaking" component={BrandMatchmaking} />
      <Route path="/home-brand/matchmaking/results" component={BrandMatchmakingResults} />
      <Route path="/home-brand/matchmaking/creator/:id" component={BrandCreatorProfile} />
      <Route path="/home-brand/unlocked" component={BrandUnlockedProfiles} />
      <Route path="/home-brand/unlocked/creator/:id" component={BrandCreatorProfile} />
      <Route path="/home-brand/credits" component={BrandCredits} />

      {/* Admin — login is public */}
      <Route path="/admin-collabryangad/login" component={AdminLogin} />

      {/* Admin — all other routes require session */}
      <AR path="/admin-collabryangad" component={AdminDashboard} />
      <AR path="/admin-collabryangad/landing" component={AdminLandingEditor} />
      <AR path="/admin-collabryangad/brand-onboarding" component={AdminBrandOnboarding} />
      <AR path="/admin-collabryangad/credits" component={AdminCreditsManagement} />
      <AR path="/admin-collabryangad/categories" component={AdminCategories} />
      <AR path="/admin-collabryangad/legal" component={AdminLegalPages} />
      <AR path="/admin-collabryangad/creator-onboarding" component={AdminCreatorOnboarding} />
      <AR path="/admin-collabryangad/pricing" component={AdminPricing} />
      <AR path="/admin-collabryangad/matchmaking" component={AdminMatchmaking} />
      <AR path="/admin-collabryangad/campaign-management" component={AdminCampaignManagement as any} />
      <AR path="/admin-collabryangad/deal-management" component={AdminDealManagement as any} />
      <AR path="/admin-collabryangad/deals" component={AdminDeals} />
      <AR path="/admin-collabryangad/campaigns" component={AdminCampaignsPage as any} />
      <AR path="/admin-collabryangad/barter" component={AdminBarterPage as any} />
      <AR path="/admin-collabryangad/platform-settings" component={AdminPlatformSettings} />
      <AR path="/admin-collabryangad/deal-settings" component={AdminDealSettings as any} />
      <AR path="/admin-collabryangad/campaign-settings" component={AdminCampaignSettings as any} />
      <AR path="/admin-collabryangad/brand-landing" component={AdminBrandLandingEditor} />
      <AR path="/admin-collabryangad/creator-landing" component={AdminCreatorLandingEditor} />
      <AR path="/admin-collabryangad/landing-videos" component={AdminLandingVideos} />
      <AR path="/admin-collabryangad/about-us" component={AdminAboutUs} />
      <AR path="/admin-collabryangad/contact-us" component={AdminAboutUs} />

      <Route path="/brand" component={BrandLandingPage} />
      <Route path="/creator" component={CreatorLandingPage} />
      <Route path="/home-brand/notifications" component={BrandNotifications} />
      <Route path="/home-brand/deals" component={BrandDeals as any} />
      <Route path="/home-brand/deals/request/:id" component={BrandDeals as any} />
      <Route path="/home-brand/campaigns" component={BrandCampaigns as any} />
      <Route path="/home-brand/campaigns/create" component={BrandCreateCampaign} />
      <Route path="/home-brand/campaigns/create-barter" component={BrandCreateBarter as any} />
      <Route path="/home-brand/campaigns/:id" component={BrandCampaignDetail as any} />
      <Route path="/home-brand/barter/:id" component={BrandBarterDetail} />
      <Route path="/payment-return" component={BrandPaymentReturn} />
      <Route path="/signup-creator" component={CreatorSignup} />
      <Route path="/login-creator" component={CreatorLogin} />
      <Route path="/home-creator" component={HomeCreator} />
      <Route path="/home-creator/earnings" component={CreatorEarningsHistory} />
      <Route path="/home-creator/profile" component={CreatorProfile} />
      <Route path="/home-creator/notifications" component={CreatorNotifications} />
      <Route path="/home-creator/requests" component={CreatorRequests} />
      <Route path="/home-creator/deals" component={CreatorDeals} />
      <Route path="/home-creator/campaigns" component={CreatorCampaigns} />
      <Route path="/home-creator/campaigns/:id" component={CreatorCampaignDetail} />
      <Route path="/home-creator/barter/:id" component={CreatorCampaignDetail} />
      <Route path="/home-creator/barter">{() => { window.location.replace((import.meta.env.BASE_URL ?? "").replace(/\/$/, "") + "/home-creator/campaigns?tab=barter"); return null; }}</Route>
      <Route path="/terms-conditions" component={TermsAndConditions} />
      <Route path="/privacy-policies" component={PrivacyPolicy} />
      <Route path="/about-us" component={AboutUsPage} />
      <Route path="/contact-us" component={AboutUsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AdminAuthProvider>
          <BrandAuthProvider>
            <CreatorAuthProvider>
              <BrandFcmAutoRegister />
              <CreatorFcmAutoRegister />
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <ScrollToTop />
                <PixelPageViews />
                <DataLayerPageViews />
                <TopProgressBar />
                <Suspense fallback={<PageLoader />}>
                  <Router />
                </Suspense>
              </WouterRouter>
            </CreatorAuthProvider>
          </BrandAuthProvider>
        </AdminAuthProvider>
        <Toaster />
        <InstallPrompt />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
