import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import shieldImage from "../assets/vadma-shield.png";
import "../styles/LoginScreen.css";
import "../styles/LoginScreen-responsive.css";

const loginBackgrounds = [
  "/images/login-backgrounds/CreateNewSite.jpg",
  "/images/login-backgrounds/Species-Header-Alewife.jpg",
  "/images/login-backgrounds/Species-Header-AmericanShad.jpg",
  "/images/login-backgrounds/Species-Header-AshyDarter.jpg",
  "/images/login-backgrounds/Species-Header-BandedSunfish.jpg",
  "/images/login-backgrounds/Species-Header-BlackCrappie.jpg",
  "/images/login-backgrounds/Species-Header-Bluegill.jpg",
  "/images/login-backgrounds/Species-Header-BrookTrout.jpg",
  "/images/login-backgrounds/Species-Header-ChainPickerel.jpg",
  "/images/login-backgrounds/Species-Header-GreenSunfish.jpg",
  "/images/login-backgrounds/Species-Header-HickoryShad.jpg",
  "/images/login-backgrounds/Species-Header-LargemouthBass.jpg",
  "/images/login-backgrounds/Species-Header-Muskellunge.jpg",
  "/images/login-backgrounds/Species-Header-NorthernPike.jpg",
  "/images/login-backgrounds/Species-Header-Pumpkinseed.jpg",
  "/images/login-backgrounds/Species-Header-RainbowTrout.jpg",
  "/images/login-backgrounds/Species-Header-SmallmouthBass.jpg",
  "/images/login-backgrounds/Species-Header-Walleye.jpg",
  "/images/login-backgrounds/Species-Header-YellowPerch.jpg",
  "/images/login-backgrounds/UseExistingSite.jpg",
  "/images/login-backgrounds/VirginiaWaters.jpg",
];

type LoginScreenProps = {
  loading: boolean;
  error: string;
  message?: string;
  onEmailPasswordLogin: (email: string, password: string) => Promise<void>;
  onPasswordReset: (email: string) => Promise<void>;
};

export default function LoginScreen({
  loading,
  error,
  message = "",
  onEmailPasswordLogin,
  onPasswordReset,
}: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const backgroundImage = useMemo(() => {
    const index = Math.floor(Math.random() * loginBackgrounds.length);
    return loginBackgrounds[index];
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onEmailPasswordLogin(email.trim(), password);
  }

  async function handlePasswordReset() {
    await onPasswordReset(email.trim());
  }

  return (
    <main
      className="login-page"
      style={{ backgroundImage: `url("${backgroundImage}")` }}
    >
      <div className="login-shell">
        <section className="login-brand-panel">
          <div className="login-shield-column">
            <img
              className="login-shield"
              src={shieldImage}
              alt="VADMA shield"
            />
          </div>

          <div className="login-brand-copy">
            <p className="login-kicker">VADMA</p>
            <h1>Virginia Aquatics Data Management Application</h1>
            <p>
              A DWR Aquatics Division platform for secure data acquisition,
              analysis, and survey management.
            </p>

            <div className="login-feature-list">
              <div className="login-feature-pill">Offline Drafts</div>
              <div className="login-feature-pill">Field Collection</div>
              <div className="login-feature-pill">Agency Review</div>
              <div className="login-feature-pill">Secure Access</div>
              <div className="login-feature-pill">Living Data Pipeline</div>
            </div>
          </div>
        </section>

        <section className="login-panel" aria-labelledby="login-heading">
          <div className="login-panel-heading">
            <p>AUTHORIZED ACCESS</p>
            <h2 id="login-heading">Sign in to VADMA</h2>
            <span>Use the account assigned by your administrator.</span>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="login-label">
              Email Address
              <div className="login-input-wrap">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  disabled={loading}
                />
              </div>
            </label>

            <label className="login-label">
              Password
              <div className="login-input-wrap">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />
              </div>
            </label>

            <button
              type="submit"
              className="primary-login-button"
              disabled={loading || !email.trim() || !password}
            >
              {loading ? "Signing in..." : "Login with Email"}
            </button>

            <button
              type="button"
              className="forgot-password-link"
              onClick={handlePasswordReset}
              disabled={loading}
            >
              Forgot Password?
            </button>
          </form>

          {message && <div className="login-info">{message}</div>}
          {error && <div className="login-error">{error}</div>}

          <p className="login-footnote">
            Access is restricted to authorized users. Contact the VADMA
            Administrator if you need an account.
          </p>
        </section>
      </div>
    </main>
  );
}
