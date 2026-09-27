# OceanEmbed demo backend

This is a small, dependency-free Node.js server for the OceanEmbed frontend. The map and profile simulation still run in the browser; this backend does not read satellite archives, train a model, or produce scientific reconstruction results.

## Run

```powershell
npm start
```

Open http://localhost:3000. Set `PORT` to use another port.

## Deploy to Render

This repository includes `render.yaml` for a Render **Web Service**. In Render, choose **New + → Blueprint**, connect this repository, and deploy the `main` branch. The blueprint starts the Node server, which serves both the website at `/` and the API. Do not create a Static Site for this configuration.

To configure a Web Service manually, use build command `npm install`, start command `npm start`, leave the root directory blank, and set the health-check path to `/api/status`. No environment variables are required; Render supplies `PORT`.

## API

- `GET /api/status` reports service availability and explicitly indicates that data are synthetic and no model is loaded.
- `GET /api/metadata` returns the problem-statement domain, grid, target depths, and recommended product names.
- `POST /api/profile/export` validates a synthetic 15-level profile and returns it as a CSV attachment. Request JSON contains `metadata` (`lon`, `lat`, `dayOfYear`, `modelScenario`, `inputs`) and `profile` records (`depth_m`, `t_reconstructed_c`, `t_reference_synthetic_c`, `error_c`). Coordinates must be inside 45–105°E, 5–30°N, and profile depths must match the standard levels.

The frontend falls back to a local CSV download when opened directly from disk or when the API is unavailable.
