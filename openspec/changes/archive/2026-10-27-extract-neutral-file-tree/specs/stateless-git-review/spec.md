## ADDED Requirements

### Requirement: Compose Git history with Resizable

The history view SHALL use nested shadcn Resizable groups for its three columns and history/diff rows. The panel SHALL preserve the existing default dimensions, minimum column widths and row heights, compact separator spacing, session proportions and responsive stacked layout. Resizing one column boundary SHALL leave the opposite outer column unchanged and SHALL stop at the commit-list minimum width. The library SHALL own pointer handling and separator accessibility, with existing pixel keyboard steps retained through its layout API.

#### Scenario: Resize a single column boundary

- **WHEN** the user drags either vertical separator within the history view
- **THEN** its neighboring panes resize, the other outer pane retains its width and the commit list remains at least 16rem wide

#### Scenario: Collapse and reopen the history diff

- **WHEN** the user collapses and reopens the history diff or leaves and returns to history
- **THEN** the session layout is restored, loaded content remains associated with the correct commit and resizing does not query Git or emit feedback

#### Scenario: Resize while reviewing retained content

- **WHEN** the user resizes history columns or the history/diff height
- **THEN** the loaded row and diff identities, scroll positions and saved annotations remain available, and a draft editor remains intact during keyboard resizing
