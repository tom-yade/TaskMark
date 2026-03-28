# Change Log

All notable changes to the "TaskMark" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.2.0] - 2026-03-28

### Added
- Date range support for events and tasks (e.g., `2026-04-01 ~ 2026-04-03`) (#17).
- Syntax highlighting for date range headers.
- `except:` modifier to cancel specific occurrences of a repeat schedule.

### Fixed
- Accept unpadded dates and times and normalize to zero-padded format (#28).
- `except:` dates in repeat options are now normalized for correct skip matching.
- Date range end date now takes priority over `@repeat` and time fields.
- Time display is hidden for date range items in calendar view.
- Date range with end date before start date is now rejected.
- Date header highlight rule priority corrected to prevent override by Markdown scope.

## [1.1.0] - 2026-03-26

### Added
- Theme Adaptive support (Light, Dark, High Contrast).

### Fixed
- Fixed a bug where recurring schedules duplicated geometrically (#1).
- Fixed a timezone parsing bug where the `until:` repeat option excluded the final end date (#5).
- Removed the arbitrary 12-repeat limit; recurrences now expand up to 10 years by default (#5).
- Fixed timeline label visibility for 0% progress tasks on light themes (#9, #4).
- Optimized calendar tile hover rendering to prevent font flickering.

## [1.0.0] - 2026-03-22

### Added
- Initial release of TaskMark! 🎉
- Interactive Calendar views (Monthly, Weekly, Daily).
- Drag-to-pan, zoomable Gantt Chart (Timeline).
- Markdown-based scheduling and task management.
- Intelligent custom tag coloring.
- Advanced recurring schedules (e.g., `@repeat(every:2weeks, until:2026-12-31)`).
