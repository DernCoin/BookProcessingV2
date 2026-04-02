# Library Acquisitions & Processing Web App

A clean, practical staff workflow application for tracking library materials from order/intake through completion/shelving.

## Run locally

Because this is a static web app, you can run any static server from the repo root.

Example with Python:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Included workflow support

- Ordered, donated, memorial, adopted author, and bulk donation intake items
- Flexible manual status movement (including skip steps)
- Bulk donation batch creation and quick-add item intake
- Rejected and damaged item handling with notes
- In-process queue with aging indicators
- Reports: damaged, incomplete, rejected, batch report, and acquisitions summary filters
- Printable processing slips for one or multiple items
- Settings for additional status/source lookup values

## Data storage

All data is stored in browser localStorage using key `library-acq-processing-v1`.
