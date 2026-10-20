---
name: workflow-commit-messages
description: Write English commit messages that describe the actual staged changes
type: workflow
---

Write commit messages in English using `<type>(<scope>): <summary>`. Omit `(<scope>)` when no useful scope applies. Use a concise, action-oriented summary that describes the resulting change.

Choose the type from the actual behavior and intent of `git diff --cached`:

- `feat`: New functionality.
- `fix`: Bug fixes or corrections to behavior.
- `refactor`: Code restructuring without changing behavior.
- `chore`: Build, dependency, or configuration changes.
- `docs`: Documentation changes.
- `style`: Formatting changes.
- `test`: Test changes.

Do not choose the type solely by file extension. For example, a Markdown skill change that corrects agent behavior is a `fix`, even though the file is documentation-shaped.

For changes that need explanation, leave a blank line after the summary and add a body describing the meaningful changes and their reasons. Use bullet points when several changes need to be listed. Scale the detail to the change; avoid repeating the diff line by line.

```text
fix(skills): correct CLI invocation guidance

- Use the supported argument format in the deployment instructions
- Clarify when the agent should inspect command help
```

**Why:** Commit messages should help readers understand what changed and why, rather than merely naming edited files.
**How to apply:** Inspect the staged diff and, when the repository has commits, run `git log --oneline -20` in the repository being committed to before composing the message. Writing a message or maintaining this convention does not authorize a commit, push, or other remote write.
