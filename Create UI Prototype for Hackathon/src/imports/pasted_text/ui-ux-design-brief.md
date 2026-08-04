# UI/UX Design Brief — Persistent 3D Story World

## 1. Product Overview

The product allows users to read a book chapter by chapter while the system converts each chapter into an evolving, persistent 3D world.

The reading experience remains the primary entry point. While the user is reading a chapter, the system processes the chapter in the background and updates the existing 3D world. Once processing is complete, the user can enter and explore the latest version of the scene.

The 3D world should not be regenerated independently for every chapter. It should retain previously established locations, objects and spatial relationships, while applying only the changes introduced by the latest chapter.

---

## 2. Primary User Flow

```text
Select or add a book
        ↓
Open Chapter 1 in Reader View
        ↓
3D scene processes in the background
        ↓
Scene successfully generated
        ↓
“Explore the Scene” becomes available
        ↓
User enters the 3D world
        ↓
User explores changes and refers to chapter text
        ↓
User proceeds to the next chapter
        ↓
The existing world is updated
```

---

## 3. Screen 1: Book Selection

### Purpose

Allow users to select an existing demonstration book or provide their own book content.

### Main components

#### Page header

* Product logo or name
* Short product description
* Optional Admin Mode entry

#### Preloaded book section

Display a list of prepared books as cards.

Each card may contain:

* Book title
* Cover image
* Author
* Number of chapters
* Short description
* Processing status, where applicable
* “Start Reading” or “Continue Reading” button

#### Add-your-own-book section

Provide an entry point labelled:

* “Add a Book”
* “Upload Your Story”
* “Import Book”

Supported input methods for the prototype may include:

* Paste complete book text
* Upload a plain-text file
* Enter the book title
* Confirm or edit automatically detected chapter divisions

### Required states

* Empty state
* Uploading state
* Chapter-detection state
* Successfully imported
* Import failed
* Unsupported or empty content

---

## 4. Screen 2: Chapter Reader

### Purpose

Present the chapter in a familiar digital-book format while the corresponding 3D world is processed in the background.

### Layout

Use a centred reading column with generous margins and clear typography.

The interface should resemble an e-book reader rather than an AI configuration tool.

### Header

Include:

* Back to library
* Book title
* Current chapter title
* Chapter progress, for example “Chapter 2 of 8”
* Optional Admin Mode indicator

### Reading area

The chapter content should:

* Be vertically scrollable
* Use readable line length and spacing
* Preserve paragraph separation
* Support long chapter content
* Remember the user’s reading position
* Avoid being blocked by the 3D-processing status

### Background scene-processing status

While the user reads, show a small, non-intrusive status component.

Suggested stages:

1. Understanding the chapter
2. Matching existing world elements
3. Updating object positions and states
4. Preparing the 3D scene

The status should not cover or interrupt the chapter text.

Possible placements:

* Below the chapter title
* As a small floating status at the bottom
* Inside a collapsible status panel

### Bottom action area

The main action should appear after the user reaches the bottom of the chapter.

#### Processing in progress

Display:

* Loading indicator
* “Preparing the 3D world”
* Disabled exploration button

#### Processing successful

Display a primary button:

**Explore the Scene**

Optional supporting information:

* Number of new objects
* Number of moved objects
* Number of updated objects
* Estimated scene status such as “Scene ready”

#### Processing failed

Display:

* Clear failure message
* Primary button: **Retry Loading**
* Secondary option: continue reading or return to the library
* Optional technical details only in Admin Mode

### Important interaction rule

Users may continue reading while the scene is processing. They should not be required to remain at a loading screen.

---

## 5. Screen 3: 3D Exploration View

### Purpose

Allow users to explore the most recently processed version of the persistent story world.

### Main layout

The 3D world occupies the full screen.

Supporting interfaces should use floating panels or hidden drawers so they do not obstruct exploration.

### Top-left controls

Possible controls:

* Return to reader
* Current book and chapter
* Reset camera
* Help or movement controls

### Hidden chapter panel on the right

The chapter text should be hidden by default inside a collapsible right-side drawer.

#### Closed state

Show a small button or tab such as:

* “View Chapter”
* Book icon
* Text icon

#### Open state

The panel slides in from the right and contains:

* Current displayed chapter title
* Scrollable chapter text
* Previous chapter arrow, where applicable
* Next chapter arrow only when the chapter has already been processed or when the product flow permits it
* Close-panel control

### Previous-chapter text navigation

Users may use an arrow to view the text of a previous chapter.

However:

* The 3D world must remain at the latest processed state.
* Changing the displayed text must not roll back the scene.
* A label should explain this clearly.

Suggested message:

> Viewing Chapter 1 text. The 3D world reflects the latest processed chapter: Chapter 3.

This prevents confusion between reading history and scene history.

### Bottom navigation

Provide a prominent button:

**Proceed to Next Chapter**

On selection:

1. Exit or transition away from the current exploration view.
2. Open the next chapter in Reader View.
3. Start processing the next world update in the background.
4. Preserve the current world until the new update is ready.

For the final chapter, replace the button with an appropriate completion action such as:

* “Finish Exploration”
* “Return to Library”
* “Review the World”

---

## 6. Chapter Update Summary

### Placement

Display a compact summary button or card in the top-right corner.

Example label:

**Chapter Updates · 4**

### Collapsed state

Show:

* Number of changes
* Small status icon
* Optional alert badge when conflicts exist

### Expanded state

Display changes introduced by the current chapter.

Suggested categories:

* Added
* Moved
* Updated
* Removed
* Unchanged
* Possible conflicts

Example:

```text
Chapter 3 Updates

Added
• Hidden doorway
• Silver key

Moved
• Red armchair: fireplace → window

Updated
• Portrait: straight → tilted

Unchanged
• Desk
• Fireplace
• Main door
```

### Object interaction

Where supported by the 3D viewer, selecting an item in the update summary should:

* Highlight the object in the 3D scene
* Move or focus the camera towards it
* Open its object-information panel

---

## 7. Object Inspection

When the user selects an object in the 3D world, open a compact information panel.

The panel may display:

* Object name
* Current location
* Current condition
* Chapter in which it was introduced
* Latest chapter that changed it
* Relevant source sentence
* Whether the information was explicit, inferred or a visual default
* Confidence level
* Previous position or state, where applicable

Example:

```text
Red Armchair

Current position:
Beside the window

Previous position:
Beside the fireplace

Changed in:
Chapter 2

Source:
“She pulled the red armchair towards the window.”

Evidence:
Explicit
```

---

## 8. Admin Mode and Conflict Resolution

### Entry point

Provide an escalation or warning icon at the top of the interface.

Possible visual treatments:

* Warning triangle
* Flag icon
* Shield icon
* “Admin Review” label

When unresolved conflicts exist, show a badge containing the number of pending issues.

### Access behaviour

For the prototype, Admin Mode may be activated through:

* A simple role toggle
* A predefined admin account
* A hidden demo control

Full authentication is not necessary unless required by the team.

### Conflict panel

Each conflict should display:

* Affected location or object
* Earlier statement
* Current conflicting statement
* Chapters containing both statements
* Current interpretation used by the 3D world
* Confidence or reasoning summary

### Admin actions

Allow the admin to:

* Retain the earlier interpretation
* Accept the latest interpretation
* Keep the issue unresolved
* Optionally enter a manual correction

After resolution:

* Update the world state if necessary
* Record the admin decision
* Remove or update the escalation badge
* Show that the interpretation was manually reviewed

---

## 9. Key Interface States to Include in Figma

The prototype should include designs for the following states:

1. Book library with preloaded books
2. Add-book flow
3. Chapter reader before processing starts
4. Chapter reader while scene is processing
5. Scene successfully loaded
6. Scene-processing failure
7. Full-screen 3D exploration
8. Hidden chapter drawer closed
9. Hidden chapter drawer open
10. Chapter update summary expanded
11. Object selected
12. Previous chapter text displayed while latest scene remains active
13. Admin escalation badge
14. Conflict-review panel
15. Conflict successfully resolved
16. Final chapter completed

---

## 10. Recommended Figma Prototype Flow

The clickable prototype should demonstrate this scenario:

1. User selects a prepared book.
2. Chapter 1 opens in Reader View.
3. Scene-processing status appears while the user scrolls.
4. “Explore the Scene” becomes active.
5. User enters the 3D environment.
6. User opens the hidden chapter panel.
7. User selects an object and sees its source information.
8. User proceeds to Chapter 2.
9. The existing world is updated.
10. User opens the chapter-update summary.
11. User views previous chapter text while the latest scene remains displayed.
12. An admin conflict badge appears.
13. Admin reviews and resolves the conflict.
14. The updated interpretation appears in the world.

The prototype should prioritise clarity of the persistent-world concept over decorative visual complexity.
