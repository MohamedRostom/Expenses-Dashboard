# Feature Specification: Dashboard Widgets

**Feature Branch**: `003-dashboard-widgets` (spec directory; delivery branch to be named when the
feature is scheduled)

**Created**: 2026-09-17

**Status**: Draft

**Input**: User description: "create a new spec for adding new feature to dashboard to multiple
widgets like temperature, currency, any other helpful widget"

Desk users add small, glanceable widgets to their dashboard: the exchange rates that matter to
them, the weather where they are, and a short list of other helpful tiles. Each widget is
read-only information with a clear "as of" time, chosen and arranged by the user, and it never
changes how expenses are recorded. The currency widget shows the same rates Desk uses to convert
expenses, so what the user sees in the widget is what they get in the ledger.

## Clarifications

### Session 2026-09-17

- Q: Where does the widget area appear? → A: On both the "Today" page (spec 002) and the
  expenses month view, with one shared arrangement; the month view strip loads after the
  expenses data.
- Q: Which widgets ship in the first release beyond currency and weather? → A: "Spend pace"
  and "upcoming fixed costs" (both from Desk's own expense data) and "sunrise and sunset"
  (from the same source and place as the weather widget).
- Q: Does a "use my current location" control exist? → A: Yes, alongside typed search: an
  explicit button that asks the device once on tap, resolves the coordinates to the nearest
  place name, and discards the coordinates; only the place is stored.

### Session 2026-09-17 (pre-planning, answered by the agent at the owner's request)

- Q: Should Desk fetch the last month of daily rates when a currency is added so the
  previous-day and 30-day changes are available immediately? → A: Yes; one date-range request
  per currency pair on add, then the daily cache keeps it current; a currency with less
  history shows "since <first date>".
- Q: What is "the month's budget" for spend pace when budgets are per category? → A: The sum
  of category budgets for the month, identical to the month view's "budgeted" tile;
  categories without a budget count toward spend but not budget.
- Q: Is the "usual amount" of an upcoming fixed cost the category budget? → A: Yes when a
  budget is set (matching the baseline forecast formula); otherwise the previous month's
  amount; otherwise "no usual amount yet".
- Q: Are sunrise and sunset shown in the place's local time or the user's zone? → A: The
  place's local time; the zone is shown only when it differs from the user's.
- Q: How does Desk stay within a shared, keyless weather source's quota? → A: One cached
  reading per place (coordinates rounded to two decimals, about 1 km), refreshed hourly only
  for places with an active user; place search needs three characters and a typing pause, at
  most ten searches per user per minute, results cached for a day.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Watch the currencies I care about (Priority: P1)

A user whose default currency is GBP but who spends in EUR and USD adds a currency widget and
picks those two currencies. The widget shows, for each one, today's rate against the default
currency, which day the rate is from, and how it moved since the previous published rate and
over the last thirty days. The rate shown is exactly the rate Desk would apply to an expense
entered today in that currency, so the widget doubles as a check on conversions.

**Why this priority**: it is the widget most tied to the product's purpose, it needs no new
external data (Desk already fetches and caches daily rates for conversions), and it proves the
widget model before any third-party source is added.

**Independent Test**: set the default currency to GBP, add a currency widget with EUR and USD,
enter an expense of 10 EUR dated today, and confirm the rate the widget shows for EUR equals
the rate recorded on that expense; open the app on a weekend and confirm the widget names the
Friday the rate was published.

**Acceptance Scenarios**:

1. **Given** a user with no widgets, **When** they open the widget area, **Then** they see an
   empty state that explains what widgets are and offers the available widgets.
2. **Given** a currency widget with EUR selected and a default currency of GBP, **When** the
   widget loads, **Then** it shows the EUR to GBP rate for today's published date, the date
   itself, and the change since the previous published date and over thirty days, with the
   direction marked.
3. **Given** the rate shown in the widget, **When** the user enters an expense in that
   currency dated today, **Then** the expense uses the identical rate and rate date.
4. **Given** a weekend or holiday, **When** the widget loads, **Then** it shows the last
   published rate and names the date it was published.
5. **Given** the user changes their default currency, **When** the widget reloads, **Then**
   every rate is shown against the new default.
6. **Given** a currency Desk cannot obtain a rate for, **When** the user tries to add it,
   **Then** the picker refuses it with a message naming the currency.

---

### User Story 2 - See the weather where I am (Priority: P1)

A user adds a weather widget, names a place (a city or postcode), and sees the current
temperature and conditions, today's high and low, and a short outlook for the next days in the
unit they choose. The widget refreshes on its own while the user is around and says when its
figures are from.

**Why this priority**: it is the widget the request named first and the one most people expect
from a dashboard; it introduces the first third-party widget source and the privacy handling for
a location, so it must be designed carefully but early.

**Independent Test**: add a weather widget for "Manchester, UK", confirm a temperature and
condition appear within five seconds with an "as of" time less than an hour old, switch the unit
to °F and confirm the same reading converts correctly, then disconnect from the network and
confirm the last reading stays visible marked as stale.

**Acceptance Scenarios**:

1. **Given** a new weather widget, **When** the user types a place, **Then** matching places
   are offered with their region and country so ambiguous names (Manchester UK vs Manchester
   NH) can be told apart, and nothing is saved until one is chosen.
2. **Given** a chosen place, **When** the widget loads, **Then** it shows current temperature,
   a condition word and icon, today's high and low, a three-day outlook, and the time the
   reading was taken.
3. **Given** the unit setting, **When** the user switches between °C and °F, **Then** every
   figure in the widget converts and the choice is remembered for all weather widgets.
4. **Given** the weather source is unreachable, **When** the widget refreshes, **Then** the
   last reading stays visible, marked stale with its time, and no generic error replaces it.
5. **Given** the user removes the weather widget, **When** they look at their settings and
   data export, **Then** the place they had chosen is gone from both.
6. **Given** the user has never granted device location, **When** they add a weather widget,
   **Then** Desk does not ask the device for location unless the user taps the "use my current
   location" button, which says what it will do before the tap.
7. **Given** the user taps "use my current location" and grants permission, **When** the
   place resolves, **Then** an approximate place ("near <city>", with region and country) is
   shown for confirmation or replacement by typing, the coordinates are discarded, and only
   the confirmed place is stored.
8. **Given** the user taps "use my current location" and denies permission or the device
   cannot resolve a place, **When** the request ends, **Then** the typed search stays
   available and no error blocks the widget.

---

### User Story 3 - Arrange my dashboard (Priority: P2)

A user adds, removes, reorders and duplicates widgets (two currency widgets with different
sets, say), and the arrangement follows them to every device they sign in on. Each widget has a
small settings sheet for its own options.

**Why this priority**: personalisation is what makes a widget area worth having, but a fixed
default arrangement already delivers the first two stories.

**Independent Test**: on a laptop add three widgets and move the weather widget first; sign in
on a phone and confirm the same three widgets appear in the same order; remove one on the
phone and confirm it is gone on the laptop after reload.

**Acceptance Scenarios**:

1. **Given** the widget area, **When** the user opens "add widget", **Then** every available
   widget is listed with a one-line description and a preview, and adding one places it last.
2. **Given** several widgets, **When** the user moves one with a pointer or with the keyboard,
   **Then** the new order is saved and announced to assistive technology.
3. **Given** a widget, **When** the user opens its settings, **Then** only that widget's
   options are shown (currencies for the currency widget, place and unit for weather) and
   changes apply immediately.
4. **Given** the maximum number of widgets, **When** the user tries to add another, **Then**
   the add control is disabled with the limit shown.

---

### User Story 4 - Other helpful widgets (Priority: P3)

Beyond currency and weather, three further widgets round out the area: "spend pace" (this
month's spend so far against the month's budget, with days left and the daily amount that
would land on budget), "upcoming fixed costs" (the fixed-kind categories not yet recorded this
month, with their usual amount and the total still expected), and "sunrise and sunset" (today's
times for the weather widget's place, and the day length). The first two use only Desk's own
expense data; the third uses the same source and place as the weather widget.

**Why this priority**: the request asks for "any other helpful widget"; the two expense-data
widgets make the area useful to the product's purpose and need no new source, and sunrise and
sunset costs nothing beyond the weather source already introduced. All three come after the
two named widgets.

**Independent Test**: in a test account seeded with a month of expenses, a budget, and
Rent and Internet as fixed categories with Rent already recorded, add all three widgets and
confirm spend pace matches the month view's total and budget, upcoming fixed costs lists
Internet only with its usual amount, and sunrise and sunset shows today's times for the
weather widget's place; confirm the first two made no external request.

**Acceptance Scenarios**:

1. **Given** a month with a budget and some expenses, **When** the spend pace widget loads,
   **Then** it shows spend so far, the budget, the percentage used, the days left in the month
   and the daily amount that would end exactly on budget, all in the default currency and equal
   to the month view's figures; over budget is marked with the critical status colour.
2. **Given** no budget set for the month, **When** the spend pace widget loads, **Then** it
   shows spend so far and an empty-state line offering to set a budget, not an error.
3. **Given** fixed-kind categories, **When** the upcoming fixed costs widget loads, **Then** it
   lists each fixed category with no expense this month, its usual amount (the category
   budget, else the previous month's amount marked "about"), and the total still expected;
   categories already recorded this month are absent.
4. **Given** every fixed category already recorded this month, **When** the widget loads,
   **Then** it says all fixed costs are in and shows their total.
5. **Given** a weather widget with a place, **When** the sunrise and sunset widget is added,
   **Then** it uses that place without asking again and shows today's sunrise, sunset and day
   length in the place's local time, naming the zone only when it differs from the user's;
   with no weather widget it asks for a place the same way.
6. **Given** a widget built on the user's own expense data, **When** the user adds an expense,
   **Then** the widget reflects it on the next reload without any external request.

---

### Edge Cases

- The rates source has not published today yet (early morning): the widget shows yesterday's
  rate and date; it never shows a blank.
- The user's default currency is the same as a selected widget currency: the picker refuses
  the selection with a message.
- The user removes a currency from their widget that is used by past expenses: nothing about
  the expenses changes; the widget simply stops showing it.
- More than the allowed number of currencies in one widget: the picker stops at the cap and
  says so; a second currency widget is offered instead.
- Two places with the same name: the picker shows region and country and requires a choice.
- A place the weather source does not know: the picker says so and keeps the previous place.
- Weather reading older than the refresh window while online: the widget refreshes on the next
  open; if the source fails it shows the old reading marked stale.
- The app is offline (installed as a PWA): every widget shows its last value marked "as of";
  no widget shows an error for being offline.
- The device clock is far from the server clock: "as of" times are computed from server time,
  so a widget never claims to be fresher than it is.
- A widget type is disabled by the operator after users added it: the widget shows a
  "temporarily unavailable" state with its last value, not an error, and can be removed.
- The user deletes their account: every widget, its settings and its chosen place are removed
  with the rest of their data.
- The user removes the weather widget but keeps sunrise and sunset: the place stays with the
  remaining widget; removing that too removes the place.
- Spend pace on the first day of the month with no expenses: shows zero spent, the full
  budget and the daily amount; never a division error or a blank.
- A fixed category with no history at all: listed with "no usual amount yet" rather than a
  guess.
- The month view and the Today page are open in two tabs: a reorder in one is reflected in the
  other on its next load; the last save wins.
- A currency the rate source began publishing less than thirty days ago: the widget shows
  the change "since <first date>" rather than a thirty-day figure.
- The weather source's daily quota is exhausted: every weather and sunrise widget shows its
  last reading marked stale with the cause "source limit reached"; place search says "try
  again later"; refreshes resume the next day without user action.
- Two users choose places that round to the same coordinates: they share one cached reading
  and neither can tell the other exists.
- Screen at 360 px wide: widgets stack in one column; nothing scrolls sideways.

## Requirements *(mandatory)*

### Functional Requirements

Widget area

- **FR-001**: Widgets live in a widget area shown as a strip at the top of both the "Today"
  page and the expenses month view, with one arrangement shared by both. On the month view the
  strip MUST render after the expenses data and MUST NOT delay it; on either page a widget
  that has no figures yet shows its loading state without shifting the content below it once
  loaded.
- **FR-002**: Users MUST be able to add, remove, reorder and duplicate widgets; the
  arrangement is per user, saved on the server, and identical on every device the user signs in
  on. A user MAY have at most eight widgets; the ninth add is refused with the limit shown.
- **FR-003**: Every widget MUST have loading, empty, stale, error and unavailable states, MUST
  show the time its figures are from, and MUST keep its last figures visible when a refresh
  fails; error copy MUST name the cause: source unreachable, source limit reached, place not
  found, rate not published (these four come from the server), or offline (decided on the
  device, never reported as a server error).
- **FR-004**: Every widget MUST be usable by keyboard and screen reader: adding, removing,
  reordering and changing settings MUST work without a pointer, and reorder MUST be announced.
- **FR-005**: Widgets MUST be read-only. No widget creates, edits, suggests or links expenses,
  and no widget sends the user's expense data to any external source.
- **FR-006**: Every widget, its settings and its chosen place MUST belong to exactly one user
  and MUST be invisible to every other user on every screen and request; account deletion
  removes them all; data export includes widget types, settings and places but not cached
  figures. Figures cached from an external source are keyed by place or currency pair, hold no
  user data, and are shared by every user with that place or pair (FR-013); nothing in a
  cached figure reveals who else uses it.
- **FR-007**: Each widget type MUST be individually switchable by the operator; a switched-off
  type shows the unavailable state to users who already added it and is absent from the add
  list.

Currency widget

- **FR-008**: The currency widget MUST show, for each selected currency (at most six per
  widget), the rate from that currency to the user's default currency, the published date of
  that rate, the change since the previous published rate and over the last thirty days, each
  change with its direction and percentage to one decimal place. When a currency is added,
  Desk MUST obtain the previous thirty-one days of published rates for it in one request so
  both changes are available immediately; when the source holds less history the widget
  labels the change "since <first date>" instead of thirty days.
- **FR-009**: The rate and rate date shown MUST be the same rate and date Desk would record on
  an expense in that currency dated today; on weekends and holidays the widget MUST show the
  last published rate and its date.
- **FR-010**: The currency picker MUST offer only currencies Desk can convert, MUST refuse the
  user's default currency, and MUST re-base every figure when the default currency changes.

Weather widget

- **FR-011**: The weather widget MUST show, for one user-chosen place, the current temperature,
  a condition word and icon, today's high and low, a three-day outlook (day, high, low,
  condition) and the time of the current reading, in °C or °F as the user chooses; the unit
  choice applies to every weather widget the user has.
- **FR-012**: Place selection MUST be by typed search returning candidates with region and
  country, or by a "use my current location" button that states before the tap that it will
  ask the device once; nothing is stored until the user confirms a named place. Desk MUST NOT
  request the device's location except on that tap, MUST discard the coordinates once a place
  is resolved, and MUST NOT store a location more precise than the chosen place. The resolved
  place is approximate (the nearest place Desk already knows, else the main city of the
  device's time zone, shown as "near <city>") and MUST be confirmed or replaced by the user
  before anything is stored.
  A denied permission or an unresolvable location leaves typed search available with no
  blocking error.
- **FR-013**: The weather reading MUST be no older than one hour while the user is active and
  the source is reachable; readings are fetched and cached on the server once per place
  (coordinates rounded to two decimal places, about one kilometre) and shared by every user
  with that place, refreshed hourly only while a user with that place has been active in the
  last 24 hours, so the source is called neither per device nor per user. Place search MUST
  run only for three or more characters after the user pauses typing, at most ten searches
  per user per minute (the eleventh shows "wait a moment"), with results cached for a day.
- **FR-014**: The chosen place MUST be stored only with the widgets that use it (weather,
  sunrise and sunset), removed when the last of them is removed, included in the user's data
  export, and described on the privacy page together with the single source used, what is
  sent to it (the place's coarse coordinates, nothing else) and the statement that device
  coordinates from "use my current location" are sent once, rounded, and never stored; the
  resolved place is approximate ("near <city>") and always confirmed by the user.

Other widgets

- **FR-015**: Widgets built on the user's own expense data (spend pace, upcoming fixed costs)
  MUST compute from Desk's own records with no external request and MUST match the figures
  shown elsewhere in the app for the same month, category and currency.
- **FR-016**: The spend pace widget MUST show the current month's spend so far, the month's
  budget (the sum of the category budgets for the month, identical to the month view's
  "budgeted" tile; spend in categories without a budget counts toward spend but not budget),
  the percentage used, the days left and the daily amount that would end exactly on budget,
  in the default currency; with no category budget at all it shows spend so far and an offer
  to set one; over budget uses the critical status colour and never a chart-series colour.
- **FR-017**: The upcoming fixed costs widget MUST list every fixed-kind category with no
  expense in the current month, each with its usual amount and the total still expected;
  the usual amount is the category's budget when one is set (the same figure the month
  forecast uses), otherwise the previous month's amount in that category shown as "about",
  otherwise "no usual amount yet"; when all fixed categories are recorded it says so with the
  total.
- **FR-018**: The sunrise and sunset widget MUST show today's sunrise, sunset and day length
  for the place of the user's weather widget, or for a place chosen the same way when there
  is no weather widget, in the place's local time, showing the place's time zone only when it
  differs from the user's; it MUST use the same source as the weather widget and no other.

### Key Entities *(include if feature involves data)*

- **Widget**: owner user, type, position, per-type settings (currency list for the currency
  widget; a place for weather and for sunrise and sunset; none for spend pace and upcoming
  fixed costs; the temperature unit is a user preference, not a widget setting), created and
  updated times.
- **Widget type**: the catalogue entry: name, description, settings it accepts, refresh interval,
  whether it needs an external source, operator switch.
- **Cached reading**: for widgets with an external source, per place or per currency pair: the
  figures, the time they are from, the source, and whether they are stale.
- **Place**: name, region, country, time zone and coordinates rounded to two decimal places;
  owned by the widgets that chose it; the rounded coordinates are the key readings are cached
  under.
- **Rate history**: per currency pair and published date, the rate; the same store the
  conversions read, extended backwards by thirty-one days when a widget currency is added.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In every trial across a month of daily checks, the rate shown in the currency
  widget equals the rate recorded on an expense entered the same day in that currency: zero
  mismatches.
- **SC-002**: A user adds and configures a currency or weather widget in under one minute from
  opening "add widget" to seeing figures.
- **SC-003**: The widget area shows cached figures within one second of the page appearing on
  a mid-range phone, and adding the widget area does not lengthen the month view's measured
  load time by more than 100 ms.
- **SC-004**: While the user is active and the weather source is reachable, the weather reading
  is never more than one hour old in 99 % of samples over a week.
- **SC-005**: With eight widgets, every widget state (loading, empty, stale, error,
  unavailable) passes the accessibility audit with no serious or critical violations at 360 px
  and desktop width, and reorder is completed by keyboard alone in a test with a screen reader.
- **SC-006**: The isolation test across every widget request with two users finds zero leaks.
- **SC-007**: Three people outside the project add a weather widget for their own town unaided,
  and each describes correctly, without prompting, what Desk stores about their location.

## Assumptions

- Currency rates come from the same daily-cached source Desk already uses for expense
  conversion; the widget adds no new rate source and no new rate logic, only the previous and
  thirty-day comparison, which reads the cache history.
- The weather source is a keyless, free service with a usage policy that permits this use, is
  reachable from both hosting stages, and returns forecasts by coordinates; which service is an
  owner decision to be recorded in an ADR before planning (constitution Principle V: providers
  are the owner's call). Place search uses the same service's geocoding if it offers one.
- Weather readings are fetched and cached on the server per distinct place, not per user, and
  refreshed hourly while any user with that place has been active in the last 24 hours;
  readings older than seven days for places no active user has are discarded.
- Widgets with an external source are switched on per type by the operator through the existing
  feature flags, so a source can be paused without a release.
- The maximum of eight widgets per user and six currencies per currency widget are reasonable
  caps for a phone-width layout; both can be raised later without a data change.
- Widget arrangement is stored per user, not per device; a per-device arrangement is out of
  scope.
- The unit for temperature defaults to °C; it is a per-user preference, not per widget.
- The month view strip can ship in v1's later phases on its own; the Today page strip follows
  the mail and calendar feature (spec 002) and reuses the same arrangement, so the feature is
  delivered in two steps without a second design.
- "Usual amount" for a fixed category follows the baseline forecast: the category budget when
  set, else the previous month's amount, else none. Day length and sunrise and sunset come from
  the weather source's daily data, and the place's time zone from its geocoding result, so no
  second external source is added.
- Rate history for the currency widget comes from the existing rate source's date-range
  lookup (one request per currency pair on add) and lands in the same daily cache the
  conversions use; no separate history store.
- The weather source's free tier is expected to be limited to non-commercial use and roughly
  ten thousand calls a day shared across all users; the per-place cache, the hourly cadence
  for active places and the search throttle in FR-013 keep a thousand users well inside that.
  Whether a free public product counts as non-commercial is part of the source ADR.
- English interface only, as for the rest of the product.
- Out of scope: notifications or alerts from any widget, widgets that write data, widgets
  showing another user's data, third-party or user-authored widgets, embedding external web
  content, and per-device layouts.
