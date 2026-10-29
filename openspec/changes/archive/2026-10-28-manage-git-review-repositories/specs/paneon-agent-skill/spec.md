## MODIFIED Requirements

### Requirement: Git review identifies multiple repositories

The standard Git review page SHALL support explicitly identifying multiple local repositories using absolute directory paths only. Its input and feedback SHALL distinguish repositories independently of the panel's cwd and distinguish identically named files in different repositories. Each submitted Git source SHALL include its real absolute repositoryPath, whether the repository was initially configured or added by the person, so event consumers SHALL NOT require initial input to locate the source repository.

#### Scenario: Same file name in two repositories

- **WHEN** a person selects package.json from one of two configured repositories
- **THEN** the displayed diff and annotations identify the selected repository rather than relying on the file name

#### Scenario: Human-added repository feedback

- **WHEN** a person submits annotations from a repository added after panel creation
- **THEN** the same self-contained event structure includes its real absolute repository path and original content evidence
