import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  User,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { BRAND } from '../assets/brand';
import { securityRequest, setCsrfToken } from '../services/securityApi';
import {
  firebaseInitError,
  isFirebaseConfigured,
  signInWithGoogleFirebase,
} from '../services/firebase';
import { UserProfile } from '../modules/types';

type AuthStep =
  | 'login'
  | 'otp-verify'
  | 'forgot-password'
  | 'reset-password';

const IS_DEV_MODE = !import.meta.env.PROD;

interface LoginPageProps {
  onLoginSuccess: (
    user: UserProfile,
    permissions: Record<string, boolean>,
    sessionMeta?: { expiresAt?: string; rememberMe?: boolean }
  ) => void;
  onShowToast: (
    type: 'success' | 'error' | 'info',
    title: string,
    description?: string
  ) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  onShowToast,
}) => {
  const [step, setStep] = useState<AuthStep>('login');

  // Login Form State (never prefilled in Production builds)
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // CAPTCHA State
  const [captchaId, setCaptchaId] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  // OTP Verification State
  const [otpChannel, setOtpChannel] = useState<'SMS' | 'EMAIL' | 'WHATSAPP'>('SMS');
  const [otpChallengeId, setOtpChallengeId] = useState('');
  const [otpMaskedMobile, setOtpMaskedMobile] = useState('');
  const [otpDeliveryDetail, setOtpDeliveryDetail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [sandboxOtp, setSandboxOtp] = useState<string | null>(null);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Forgot & Reset Password State
  const [resetUserId, setResetUserId] = useState('');
  const [resetChallengeId, setResetChallengeId] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [firebaseLoading, setFirebaseLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [expressOnline, setExpressOnline] = useState<boolean | null>(null);
  const firebaseConfigured = isFirebaseConfigured();

  const loadCaptcha = useCallback(async (clearError = false) => {
    if (clearError) {
      setErrorBanner(null);
    }
    try {
      const res = await securityRequest<{
        challengeId: string;
        svg: string;
      }>('/api/auth/captcha');
      setCaptchaId(res.data.challengeId);
      setCaptchaSvg(res.data.svg);
      setCaptchaAnswer('');
      setExpressOnline(true);
    } catch {
      setExpressOnline(false);
      setCaptchaId('');
      setCaptchaSvg('');
    }
  }, []);

  useEffect(() => {
    if (step === 'login') {
      loadCaptcha();
    }
  }, [step, loadCaptcha]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const fillRolePreset = (role: 'ADMIN' | 'MANAGER' | 'STAFF' | 'AUDITOR' | 'CUSTOMER') => {
    setErrorBanner(null);
    if (role === 'ADMIN') {
      setUserId('MC-AD-202613-0001');
      setPassword('Admin@2026!');
    } else if (role === 'MANAGER') {
      setUserId('MC-MN-202613-0002');
      setPassword('Manager@2026!');
    } else if (role === 'AUDITOR') {
      setUserId('MC-AU-202613-0001');
      setPassword('Auditor@2026!');
    } else if (role === 'CUSTOMER') {
      setUserId('MC-CU-202613-0001');
      setPassword('Customer@2026!');
    } else {
      setUserId('MC-ST-202613-0003');
      setPassword('Staff@2026!');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    if (!userId.trim() || !password.trim() || !captchaAnswer.trim()) {
      setErrorBanner('User ID, Password, and CAPTCHA code are all required.');
      return;
    }

    setLoading(true);
    try {
      const res = await securityRequest<{
        otpRequired: boolean;
        challengeId: string;
        channel?: 'SMS' | 'EMAIL' | 'WHATSAPP';
        deliveryDetail?: string;
        maskedMobile: string;
        maskedEmail?: string;
        resendCooldownSeconds: number;
        providerConfigured: boolean;
        sandboxOtpPreview?: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          userId: userId.trim(),
          password,
          captchaId,
          captchaAnswer: captchaAnswer.trim(),
          rememberMe,
          otpChannel,
        }),
      });

      setOtpChallengeId(res.data.challengeId);
      setOtpMaskedMobile(
        otpChannel === 'EMAIL' && res.data.maskedEmail
          ? res.data.maskedEmail
          : res.data.maskedMobile
      );
      setOtpDeliveryDetail(res.data.deliveryDetail || '');
      setProviderConfigured(res.data.providerConfigured);
      setSandboxOtp(res.data.sandboxOtpPreview ?? null);
      setResendCooldown(res.data.resendCooldownSeconds);
      setOtpCode('');
      setStep('otp-verify');
      onShowToast('info', `${otpChannel} OTP Challenge Ready`, 'Complete 2-step OTP verification to continue.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed.';
      setErrorBanner(message);
      onShowToast('error', 'Authentication Failed', message);
      loadCaptcha(false);
    } finally {
      setLoading(false);
    }
  };

  const handleFirebaseGoogleSignIn = async () => {
    setErrorBanner(null);
    if (!firebaseConfigured) {
      const msg =
        firebaseInitError ||
        'Firebase is not configured. Set VITE_FIREBASE_* environment variables.';
      setErrorBanner(msg);
      onShowToast('error', 'Firebase Configuration Missing', msg);
      return;
    }

    setFirebaseLoading(true);
    try {
      const { user, permissions } = await signInWithGoogleFirebase();
      onShowToast(
        'success',
        `Signed in as ${user.role}`,
        `Connected live to Firebase (${user.userId})`
      );
      onLoginSuccess(user, permissions);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Firebase Google sign-in failed.';
      setErrorBanner(message);
      onShowToast('error', 'Firebase Sign-In Failed', message);
    } finally {
      setFirebaseLoading(false);
    }
  };

  const handleVerifyLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    if (!otpCode.trim()) {
      setErrorBanner('Enter the 6-digit OTP code.');
      return;
    }

    setLoading(true);
    try {
      const res = await securityRequest<{
        user: Omit<UserProfile, 'avatarInitials'>;
        permissions: Record<string, boolean>;
        csrfToken: string;
        passwordExpired?: boolean;
        session?: {
          id: string;
          expiresAt: string;
          rememberMe?: boolean;
        };
        device?: {
          deviceId: string;
          deviceName: string;
          verificationStatus: string;
          isNewDevice: boolean;
        };
      }>('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: otpChallengeId,
          otp: otpCode.trim(),
        }),
      });

      setCsrfToken(res.data.csrfToken);
      const initials = res.data.user.fullName
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

      if (res.data.passwordExpired) {
        onShowToast('info', 'Password Expiry Notice', 'Your password is over 90 days old. Please update it in My Profile.');
      } else if (res.data.device?.isNewDevice) {
        onShowToast('info', 'New Device Sign-In Recorded', `Verify ${res.data.device.deviceName} in Device Monitoring.`);
      } else {
        onShowToast(
          'success',
          `Signed in as ${res.data.user.role}`,
          `Session active for ${res.data.user.userId}`
        );
      }
      onLoginSuccess(
        {
          ...res.data.user,
          avatarInitials: initials || 'MC',
        },
        res.data.permissions,
        res.data.session
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OTP verification failed.';
      setErrorBanner(message);
      onShowToast('error', 'OTP Rejected', message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setErrorBanner(null);
    try {
      const res = await securityRequest<{
        challengeId: string;
        resendCooldownSeconds: number;
        providerConfigured: boolean;
        deliveryDetail?: string;
        sandboxOtpPreview?: string;
      }>('/api/auth/resend-otp', {
        method: 'POST',
        body: JSON.stringify({ challengeId: otpChallengeId, channel: otpChannel }),
      });
      setResendCooldown(res.data.resendCooldownSeconds);
      setProviderConfigured(res.data.providerConfigured);
      if (res.data.deliveryDetail) setOtpDeliveryDetail(res.data.deliveryDetail);
      setSandboxOtp(res.data.sandboxOtpPreview ?? null);
      onShowToast('info', `${otpChannel} OTP Re-issued`, 'A fresh verification code has been generated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resend failed.';
      setErrorBanner(message);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    if (!resetUserId.trim()) {
      setErrorBanner('Enter your User ID.');
      return;
    }

    setLoading(true);
    try {
      const res = await securityRequest<{
        challengeId: string;
        maskedMobile: string;
        providerConfigured: boolean;
        sandboxOtpPreview?: string;
      }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ userId: resetUserId.trim() }),
      });

      setResetChallengeId(res.data.challengeId);
      setOtpMaskedMobile(res.data.maskedMobile);
      setProviderConfigured(res.data.providerConfigured);
      setSandboxOtp(res.data.sandboxOtpPreview ?? null);
      setStep('reset-password');
      onShowToast('info', 'Reset OTP Issued', 'Enter the reset OTP and choose a new password.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to initiate reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setLoading(true);
    try {
      await securityRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: resetChallengeId,
          otp: resetOtp.trim(),
          newPassword,
          confirmPassword: confirmNewPassword,
        }),
      });
      onShowToast('success', 'Password Reset Complete', 'Sign in with your new password.');
      setUserId(resetUserId);
      setPassword('');
      setStep('login');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-950 dark:text-neutral-100 flex flex-col justify-between px-4 py-8">
      <div className="max-w-md w-full mx-auto my-auto">
        <div className="mb-6 text-center">
          <div className="inline-flex justify-center">
            <BrandLogo size="lg" />
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-6 sm:p-7">
          {errorBanner && (
            <div
              role="alert"
              className="mb-4 px-3.5 py-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-md text-xs text-red-700 dark:text-red-300"
            >
              {errorBanner}
            </div>
          )}

          {/* STEP 1: LOGIN PAGE */}
          {step === 'login' && (
            <>
              <div className="mb-5 text-center">
                <h1 className="text-xl font-bold text-neutral-950 dark:text-white">
                  Sign in to MUN COMPUTER
                </h1>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Secure Access Portal · Master Admin &amp; Manager Dashboard
                </p>
              </div>

              {/* Direct Firebase Google Sign-In Button */}
              <div className="mb-6">
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  loading={firebaseLoading}
                  onClick={handleFirebaseGoogleSignIn}
                  className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  <svg className="h-5 w-5 bg-white rounded-full p-0.5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.19v3.15C3.21 21.34 7.28 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.19C.43 8.13 0 9.85 0 11.6s.43 3.47 1.19 4.99l4.08-2.35z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.28 0 3.21 2.66 1.19 6.61l4.08 3.15c.95-2.85 3.6-4.96 6.73-4.96z"
                    />
                  </svg>
                  <span>Sign in with Google (Firebase)</span>
                </Button>
              </div>

              <div className="relative my-6 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-200 dark:border-neutral-800" />
                </div>
                <div className="relative inline-block px-3 bg-white dark:bg-neutral-900 text-xs text-neutral-400">
                  Or sign in with User ID
                </div>
              </div>

              {/* Express Server User ID + CAPTCHA Login */}
              <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
                    <div>
                      <label htmlFor="auth-userid" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                        User ID
                      </label>
                      <div className="relative">
                        <User className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="auth-userid"
                          type="text"
                          value={userId}
                          onChange={(e) => setUserId(e.target.value)}
                          placeholder="MC2627110001"
                          className="w-full h-10 pl-9 pr-3 text-sm font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:border-blue-800"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="auth-password" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setErrorBanner(null);
                            setResetUserId(userId);
                            setStep('forgot-password');
                          }}
                          className="text-xs text-blue-800 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="auth-password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter password"
                          className="w-full h-10 pl-9 pr-10 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:border-blue-800"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-800 dark:hover:text-white cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Server-Side CAPTCHA Verification */}
                    <div>
                      <label htmlFor="auth-captcha" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                        CAPTCHA Verification
                      </label>
                      <div className="flex items-center gap-2">
                        <div
                          className="shrink-0 min-w-[144px] h-[40px] bg-[#fafafa] flex items-center justify-center rounded overflow-hidden border border-neutral-200 dark:border-neutral-700"
                          dangerouslySetInnerHTML={{ __html: captchaSvg }}
                        />
                        <button
                          type="button"
                          onClick={() => loadCaptcha(true)}
                          aria-label="Refresh CAPTCHA"
                          title="Refresh CAPTCHA"
                          className="h-10 w-10 inline-flex items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 cursor-pointer shrink-0"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                        <input
                          id="auth-captcha"
                          type="text"
                          maxLength={6}
                          value={captchaAnswer}
                          onChange={(e) => setCaptchaAnswer(e.target.value.toUpperCase())}
                          placeholder="Code"
                          className="w-full h-10 px-3 text-sm font-mono uppercase bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:border-blue-800"
                        />
                      </div>
                    </div>

                    {/* 2FA OTP Channel Preference (Email, SMS, WhatsApp) */}
                    <div>
                      <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                        Two-Factor OTP Channel
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['SMS', 'EMAIL', 'WHATSAPP'] as const).map((ch) => (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => setOtpChannel(ch)}
                            className={`h-9 text-xs font-mono font-medium rounded-md border cursor-pointer transition-colors ${
                              otpChannel === ch
                                ? 'bg-neutral-950 text-white border-neutral-950 dark:bg-white dark:text-neutral-950 dark:border-white'
                                : 'bg-white dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-neutral-400'
                            }`}
                          >
                            {ch}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 text-neutral-950"
                        />
                        <span>Remember Me (4-hour / 240-min session)</span>
                      </label>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      loading={loading}
                      className="w-full"
                      icon={<ArrowRight className="h-4 w-4" />}
                    >
                      Verify &amp; Send {otpChannel} OTP
                    </Button>
                  </form>
            </>
          )}

          {/* STEP 2: OTP VERIFICATION PAGE */}
          {step === 'otp-verify' && (
            <>
              <div className="mb-5">
                <button
                  type="button"
                  onClick={() => setStep('login')}
                  className="inline-flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white mb-3 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Login</span>
                </button>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-800 dark:text-blue-400" />
                  <h1 className="text-lg font-semibold text-neutral-950 dark:text-white">
                    {otpChannel} OTP Verification
                  </h1>
                </div>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Enter the 6-digit verification code for {otpMaskedMobile}.
                </p>
                {otpDeliveryDetail && (
                  <p className="mt-1 text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                    Gateway: {otpDeliveryDetail}
                  </p>
                )}
              </div>

              {!providerConfigured && sandboxOtp && (
                <div className="mb-4 p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md text-xs">
                  <div className="font-semibold text-neutral-900 dark:text-white">
                    Sandbox OTP Preview (SMS/SMTP Provider Not Configured)
                  </div>
                  <p className="mt-1 text-neutral-600 dark:text-neutral-300">
                    Configure SMS/SMTP in Master Settings → API Integrations for live dispatch. Test OTP:{' '}
                    <button
                      type="button"
                      onClick={() => setOtpCode(sandboxOtp)}
                      className="font-mono font-bold text-blue-800 dark:text-blue-400 underline cursor-pointer"
                    >
                      {sandboxOtp}
                    </button>
                  </p>
                </div>
              )}

              <form onSubmit={handleVerifyLoginOtp} className="space-y-4">
                <div>
                  <label htmlFor="login-otp" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                    6-Digit Security OTP
                  </label>
                  <input
                    id="login-otp"
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full h-11 px-3 text-center text-lg tracking-[0.4em] font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:border-blue-800"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={loading}
                  className="w-full"
                >
                  Verify OTP &amp; Enter Workspace
                </Button>

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-neutral-500">Expires in 5 minutes</span>
                  <button
                    type="button"
                    disabled={resendCooldown > 0}
                    onClick={handleResendOtp}
                    className="font-medium text-blue-800 hover:underline disabled:text-neutral-400 disabled:no-underline cursor-pointer"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* STEP 3: FORGOT PASSWORD PAGE */}
          {step === 'forgot-password' && (
            <>
              <button
                type="button"
                onClick={() => setStep('login')}
                className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-950 mb-3 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Login</span>
              </button>
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="h-5 w-5 text-blue-800" />
                <h1 className="text-lg font-semibold text-neutral-950">
                  Forgot Password
                </h1>
              </div>
              <p className="text-xs text-neutral-500 mb-5">
                Enter your MUN COMPUTER User ID to receive a password reset OTP.
              </p>

              <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                <div>
                  <label htmlFor="fp-userid" className="block text-xs font-medium text-neutral-800 mb-1.5">
                    User ID
                  </label>
                  <input
                    id="fp-userid"
                    type="text"
                    value={resetUserId}
                    onChange={(e) => setResetUserId(e.target.value)}
                    placeholder="MC-MN-202613-0002"
                    className="w-full h-10 px-3 text-sm font-mono bg-white border border-neutral-200 rounded-md focus:outline-none focus:border-blue-800"
                  />
                </div>
                <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                  Send Password Reset OTP
                </Button>
              </form>
            </>
          )}

          {/* STEP 4: PASSWORD RESET PAGE */}
          {step === 'reset-password' && (
            <>
              <button
                type="button"
                onClick={() => setStep('forgot-password')}
                className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-950 mb-3 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>
              <h1 className="text-lg font-semibold text-neutral-950">Reset Password</h1>
              <p className="mt-1 text-xs text-neutral-500 mb-4">
                Verify reset OTP sent to {otpMaskedMobile}. Existing sessions will be revoked.
              </p>

              {!providerConfigured && sandboxOtp && (
                <div className="mb-4 p-3 bg-neutral-50 border border-neutral-200 rounded-md text-xs">
                  Sandbox Reset OTP:{' '}
                  <button
                    type="button"
                    onClick={() => setResetOtp(sandboxOtp)}
                    className="font-mono font-bold text-blue-800 underline cursor-pointer"
                  >
                    {sandboxOtp}
                  </button>
                </div>
              )}

              <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-neutral-800 mb-1">
                    Reset OTP
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={resetOtp}
                    onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="6-digit OTP"
                    className="w-full h-10 px-3 text-sm font-mono border border-neutral-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1">
                    New Strong Password (12+ chars, upper/lower/num/special)
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
                  />
                </div>
                <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                  Reset Password
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      <footer className="text-center text-xs text-neutral-500 pt-6">
        {BRAND.copyright} · Version {BRAND.version}
      </footer>
    </div>
  );
};
