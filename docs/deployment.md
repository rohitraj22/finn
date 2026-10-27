# Free deployment: GitHub and Render

## Architecture

One Docker web service runs the existing Next.js standalone build on Render's public `PORT` and FastAPI on `127.0.0.1:8000`. Browser requests stay on the site's origin. The Python supervisor stops both processes if either exits, allowing the host to restart the service. `/api/health` checks both processes without calling market-data providers or Gemini.

Only the Python process receives `GEMINI_API_KEY`; the Next.js child has it removed from its environment. No secret is used during image builds. `.dockerignore` excludes environment files, Git metadata, local caches and state. `.gitignore` excludes credentials, assignment PDFs and runtime data.

## Account steps

1. Sign in to [GitHub](https://github.com/login) and create an empty repository named `finn` (private is fine). Do not initialize it with a README; this project already has one.
2. Authenticate Git on your computer using GitHub CLI (`gh auth login`, choose GitHub.com and HTTPS) or GitHub Desktop. If the CLI is not installed, install it from the official [GitHub CLI site](https://cli.github.com/). Do not paste tokens into chat or place them in remote URLs.
3. From the project directory, after the prepared local Git commit exists:

   ```sh
   git remote add origin https://github.com/YOUR-USERNAME/finn.git
   git push -u origin main
   ```

   If a local commit has not been created, configure your Git author name/email, then `git add .` and `git commit -m "Prepare FINN for deployment"` first. Inspect `git status` before committing. Environment files, original assignment PDFs, downloaded reports and runtime caches must remain ignored.
4. Sign in to [Render](https://dashboard.render.com/) and choose **New → Blueprint**. Connect the GitHub repository and select `render.yaml`. Authorize only the intended repository. Review the plan: it must say **Free**, with no persistent disk or paid database.
5. At the environment prompt, enter `GEMINI_API_KEY` directly into Render from your local backend environment file. Keep `FINN_RESEARCH_MODEL=gemini-3.1-flash-lite` unless your project requires another supported model. Use a Gemini project without paid billing for a free-only deployment. Never add the key to GitHub source, build arguments or `NEXT_PUBLIC_` variables.
6. Deploy. Render will assign the actual `https://…onrender.com` URL. The first Docker build may take several minutes. Check build logs and health status. If the account requires payment details or an upgrade, stop and review rather than accepting a charge.
7. Run `python3 scripts/check_deployment.py https://YOUR-SERVICE.onrender.com`. Then complete the browser acceptance checks below. Record the actual URLs and failures; a healthy homepage alone does not verify external data access.

## Free-plan limitations

Render's free service sleeps after 15 minutes of inactivity; waking takes roughly a minute. Files are lost on sleep/restart/redeploy. Consequently saved alert settings, all downloaded/processed documents, AI insights and daily counters reset. The next visitor may trigger downloads and new Gemini calls. This configuration cannot guarantee durable preferences on the free plan.

Free services have limited memory/CPU and monthly usage allowances. Large annual reports may time out or exhaust memory. Failed reports must remain explicitly unavailable, never replaced with mock data. The code is unchanged in its reliance on Yahoo, NSE/BSE, Screener and Gemini; these providers can block cloud/datacenter IPs even when they work locally. Public access has no authentication: visitors share settings and AI allowance. A 60-attempt daily AI cap reduces exposure but is not an account-level billing guarantee, especially because its storage is ephemeral.

Official references: [free-service limits](https://render.com/docs/free), [Docker deployment](https://render.com/docs/docker), [environment secrets](https://render.com/docs/configure-environment-variables).

## Desktop and mobile acceptance

Use the deployed HTTPS URL at desktop width and approximately 390px mobile width:

1. Overview and Portfolio: real values, matching totals, completed-session date, working 1W/1M/3M/1Y filters, and an explicit unavailable state if Yahoo is blocked.
2. Alerts: genuine recent NSE filings, periods/categories, clickable original PDF links. Verify coverage; RSS fallback is limited history.
3. AI announcements: allow the bounded queue to finish; verify a summary against its original filing and verify fallback labels if Gemini is unavailable.
4. EOD settings: change a threshold, save, reload and check that it persists while this service instance remains alive. Restore the original value. Restart persistence is not promised on this free plan.
5. Research: load Infosys and Persistent individually, ask a document-grounded question, follow a PDF page citation, then ask for an unsupported future figure and verify abstention. Cold indexing may need a retry after the initial request finishes in the backend.
6. Check navigation, card wrapping, forms, source expansion and horizontal overflow on mobile. Confirm no client JavaScript errors or secrets in browser responses.

## Local production preview

Build with `npm run build`, copy `public` and `.next/static` into `.next/standalone` (static belongs under `.next/standalone/.next/static`), start the backend, then run `PORT=3100 node .next/standalone/server.js`. This tests the real production frontend locally; it does not test Render's network or Linux container.

If Docker is installed, use `docker build -t finn .`, then `docker run --rm -p 3100:10000 --env-file backend/.env finn`. The environment file is passed at runtime and is never copied into the image. Do not use a real key in CI builds.
