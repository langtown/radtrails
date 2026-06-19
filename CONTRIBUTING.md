# Contributing to Radtrails

## Commit Workflow

### 1. Create a Feature Branch

Use descriptive branch names with prefixes:
- `feature/` for new features (e.g., `feature/add-newsletter`)
- `fix/` for bug fixes (e.g., `fix/broken-link`)
- `refactor/` for code improvements (e.g., `refactor/cleanup-styles`)
- `docs/` for documentation (e.g., `docs/update-readme`)

```bash
git checkout -b feature/description
```

### 2. Make Your Changes

- Edit files in the relevant directories (see [AGENTS.md](./AGENTS.md) for structure)
- For content changes: update files in `lib/content/`
- For component/page changes: modify files in `components/` or `app/`
- For images: add to `public/images/` with appropriate subdirectory

### 3. Commit Changes

Write clear, concise commit messages:

```bash
git commit -m "Brief description of what changed"
```

**Commit message guidelines:**
- Use imperative mood ("Add feature" not "Added feature")
- Be specific about what changed
- Keep it under 72 characters when possible
- Examples:
  - `Add newsletter subscription form`
  - `Fix typo in racing page bio`
  - `Update coach profiles and images`
  - `Remove deprecated workflow file`

### 4. Push to Remote

```bash
git push -u origin feature/description
```

This creates the remote branch and sets up tracking.

### 5. Create a Pull Request

After pushing, GitHub will display a link:
```
https://github.com/langtown/radtrails/pull/new/feature/description
```

Visit this link to create the PR on GitHub.

## PR Description Template

When creating a PR, use this format:

```markdown
## Description
Brief explanation of what this PR does and why.

## Changes
- List the main changes
- One bullet per change
- Be specific about affected files/sections

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Content update
- [ ] Documentation
- [ ] Refactoring

## Testing
If applicable, describe how to test these changes:
- Step 1
- Step 2
- Expected result

## Related Issues
Closes #issue-number (if applicable)
```

## Example: Complete Workflow

```bash
# 1. Create feature branch
git checkout -b feature/update-coach-profiles

# 2. Make changes
# Edit lib/content/services.ts to update coach info
# Add coach images to public/images/coaches/

# 3. Commit
git commit -m "Update coaching profiles and add new coach images"

# 4. Push
git push -u origin feature/update-coach-profiles

# 5. Create PR at the GitHub link provided
# Fill in the PR description with details about changes
```

## Important Notes

- Use `nvm use` before running Node/npm commands (see [AGENTS.md](./AGENTS.md))
- Test locally with `npm run dev` before pushing
- Run `npm run lint` to check for code issues
- No GitHub CLI token is configured—PRs must be created via GitHub web interface
- Use `git push -f origin branch-name` only when amending commits (force push)

## Questions?

Refer to [AGENTS.md](./AGENTS.md) for project-specific information about app structure, commands, and deployment.
