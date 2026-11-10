# Components

Each file covers one module of `@qoggy/paneon/ui`: when to use it, its import statement and its common props.

## Form controls

| Component                    | Use when                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| [Button](button.md)          | Let the human trigger an action with a click, such as submitting, confirming or opening something.  |
| [Input](input.md)            | Collect a single line of text, a number or another value typed by the human.                        |
| [Textarea](textarea.md)      | Collect multi-line text typed by the human, such as a comment or a description.                     |
| [Slider](slider.md)          | Let the human choose a number, or a range between two numbers, by dragging along a track.           |
| [Label](label.md)            | Name a form control with visible text outside a `Field`.                                            |
| [Field](field.md)            | Lay out a form control with its label, description and error message, or group several such fields. |
| [Select](select.md)          | Pick one value from a dropdown list, when the options are too many for a `RadioGroup`.              |
| [RadioGroup](radio-group.md) | Let the human pick exactly one option from a short list that stays visible.                         |
| [Checkbox](checkbox.md)      | Let the human tick an option on or off, alone or as one of several independent choices.             |
| [Switch](switch.md)          | Let the human turn a single setting on or off.                                                      |

## Layout and content

| Component                           | Use when                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [Page](layout.md)                   | Give a panel its page frame with a title and description, group content into titled sections, and space blocks in rows or columns. |
| [Card](card.md)                     | Group related content in a bordered box with an optional header, actions and footer.                                               |
| [Separator](separator.md)           | Draw a thin horizontal or vertical divider line between pieces of content.                                                         |
| [Badge](badge.md)                   | Show a short label such as a status, tag or count inline with other content.                                                       |
| [Alert](alert.md)                   | Call out an important message, such as a warning or an error, inside the page content.                                             |
| [Empty](empty.md)                   | Show an empty state when a list, table or view has no data yet.                                                                    |
| [Spinner](spinner.md)               | Show that something is loading or a request is in progress.                                                                        |
| [toast](toast.md)                   | Show a short notification that appears in a page corner and disappears by itself.                                                  |
| [Table](table.md)                   | Show a small static table that you build row by row from table parts.                                                              |
| [ResizablePanelGroup](resizable.md) | Split an area into panels that the human can resize by dragging the handles between them.                                          |

## Navigation and overlays

| Component                            | Use when                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [Sidebar](sidebar.md)                | Build a grouped sidebar directory or application navigation with an active item and optional collapsing. |
| [Tabs](tabs.md)                      | Switch between several views of related content in the same place, showing one view at a time.           |
| [Pagination](pagination.md)          | Show page links with previous and next controls for content split into pages.                            |
| [NavigationMenu](navigation-menu.md) | Show a horizontal set of site-style navigation links, where some items open a panel of sub-links.        |
| [Breadcrumb](breadcrumb.md)          | Show the path from a root to the current location, such as folders or nested sections.                   |
| [Accordion](accordion.md)            | Stack several titled sections that each expand and collapse in place.                                    |
| [Collapsible](collapsible.md)        | Show or hide one block of secondary content behind a toggle.                                             |
| [Dialog](dialog.md)                  | Open a modal window over the page for a focused task or details that need the human's attention.         |
| [AlertDialog](alert-dialog.md)       | Ask the human to confirm or cancel an action before it happens.                                          |
| [Sheet](sheet.md)                    | Slide a panel in from a screen edge to show details or a form while keeping the page in context.         |
| [Popover](popover.md)                | Show a small floating panel anchored to a trigger, for extra details or a short form.                    |
| [Tooltip](tooltip.md)                | Show a short text hint when the human hovers or focuses an element, such as an icon button.              |
| [DropdownMenu](dropdown-menu.md)     | Open a list of actions or options from a button.                                                         |
| [ContextMenu](context-menu.md)       | Open a menu of actions when the human right-clicks or long-presses an area.                              |

## Rich content

| Component                  | Use when                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [CodeBlock](code-block.md) | Show a read-only code snippet with syntax highlighting, optional line numbers and a highlighted line range. |
| [Markdown](markdown.md)    | Render a Markdown document, such as a plan or report, with GFM, code blocks, Mermaid diagrams and images.   |
| [Image](image.md)          | Show a local or remote image, such as a chart or screenshot produced during analysis.                       |
| [FileIcon](file-icon.md)   | Show a file type icon selected from a file name or path.                                                    |
| [Mermaid](mermaid.md)      | Draw a diagram, such as a flowchart or sequence diagram, from Mermaid source.                               |
| [DiffView](diff.md)        | Compare two versions of a text, without needing a repository.                                               |
| [Tree](tree.md)            | Show an expandable hierarchy, such as a file tree, where the human selects or opens items.                  |
