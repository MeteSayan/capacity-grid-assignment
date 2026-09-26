# Decisions

Yours to write, not your AI's. Short is good — bullets are fine, and half a page is
plenty. We read this first.

## What did the spec not tell you?

* The spec was not clear which day the week should start on, so I used Monday to Sunday.

* The spec also did not say if weekends should count for assignments. I used Monday to Friday.

* For partial date ranges I decided to use full weeks. Otherwise I would be comparing part of a week's allocation with the full weekly capacity.

* There is one `weekly_hours` value for each person, so I treated `weekly_hours` as the capacity for every week.

* After editing capacity I decided to fetch the data again after the PATCH succeeds instead of updating everything only on the frontend.

## What did you notice that looked wrong?

* I noticed that while editing capacity I can still change the date range or click Previous/Next Week. This can remove an unsaved draft. I left it like this because of the time limit. I would handle it in a production version.

## What did the AI get wrong that you caught?

* The AI could not check the UI in a browser, so I tested it myself. While testing I noticed that Previous/Next Week and Apply Range were still enabled during editing, so I did not rely only on the automated checks.

## What would you do differently with a week?

* I would add more backend integration tests for the capacity calculations.

* I would look at server-side pagination for larger teams.

* I would add request timeouts and better handling for interrupted requests.

* I would ask for confirmation before navigating away when there is an unsaved edit.

* I would improve keyboard focus after closing the editor.

* I would test performance with a larger dataset.
