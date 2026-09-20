# N1C Gene Registry submission forms

Two forms replace the Google Form, and both accept one entry at a time or a filled-in template file.

| Page | What it is for | Reached from |
| --- | --- | --- |
| `submit.html` | N-of-1 therapy development projects | The "Submit Your Project" button on `N1C_projects.html` |
| `submit_variant.html` | Assessments of a variant's eligibility for a therapeutic approach | The "Submit a Variant Assessment" button on `assessed_variants.html` |

## Files

| File | Role |
| --- | --- |
| `submit.html`, `submit.css` | Project form (five steps) and its styles |
| `submit_variant.html`, `submit_variant.css` | Variant assessment form; shares `submit.css`, adds an accent colour |
| `n1c_forms.js` | Shared engine: step flow, file upload, format checks, sending. Holds the `ENV` switch and the two backend URLs |
| `xlsx.full.min.js` | SheetJS 0.18.5, reads the uploaded Excel or CSV file in the browser |
| `Submission_Template.xlsx` | Bulk template for projects (unchanged Google-Form layout) |
| `Variant_Assessment_Template.xlsx` | Bulk template for assessments: Assessments, Options, Example and Read_Me tabs |
| `script/Code.gs` | The Google Apps Script backend, installed in the tracking Google Sheet (kept here for review only) |

## Where submissions go

The forms post to a Google Apps Script web app that lives in the account that owns the tracking sheet. The script writes one row per submission (tab `Submissions` for projects, `Variant_Submissions` for assessments), saves one Excel file per submission in the Drive `Submissions` folder (sub-folders `Projects` and `Variants`), and emails the curators at generegistry@n1collaborative.org. Curators approve rows in the sheet; the `Ready_To_Publish` and `Variants_Ready_To_Publish` tabs collect approved rows in registry column order for pasting into the registry files. Nothing is published automatically.

## Switching between the test and the production backend

Open `n1c_forms.js`. Near the top:

```
N1C.ENV = 'TEST';
N1C.ENDPOINTS = {
  TEST: 'https://script.google.com/macros/s/.../exec',   // Aadhithya's test account
  PROD: 'PASTE_THE_N1C_WEB_APP_URL_HERE'                  // the N1C account
};
```

Paste the N1C web app URL into `PROD` and change `ENV` to `'PROD'`. That is the only change needed at cutover. The matching switch in `Code.gs` is `ACTIVE_PROFILE`.

## Changing wording or options

Dropdown options live in the HTML `<select>` lists and, for file uploads, in the `NORM` functions of `n1c_forms.js` (which map spelling variants to one value). Column headers of the tracking sheet are listed once in `Code.gs` (`PROJECT_HEADERS`, `VARIANT_HEADERS`); the script matches fields to columns by header name, so columns may be reordered but not renamed.
