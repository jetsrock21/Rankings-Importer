# Rankinga

Local web app for downloading 2026 fantasy football rankings and ADP data, previewing it, and exporting it.

## Sources

- ESPN PPR rankings PDF
- DraftSharks Sleeper PPR 12-team ADP, converted to ordered ranks
- FantasyPros PPR ECR
- ESPN Live Draft Results, fetched across 21 pages and converted to ordered ADP ranks

## Run

```powershell
npm install
npm start
```

Open `http://localhost:3000`.

## Downloads

- `fantasy-rankings.xlsx`: two sheets, `rankings` and `adp`
- `rankings.csv`: `name,fantasypros_rank,espn_rank,sleeper_rank`
- `adp.csv`: `Name,ESPN ADP,Position`

## Check the scrapers

```powershell
npm run check
```

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New Project** and import that repository.
3. Leave the framework preset as **Other**.
4. Leave build command blank.
5. Leave output directory blank.
6. Deploy.

The app is static HTML/CSS/JS from `public/`, with serverless functions in `api/`.
