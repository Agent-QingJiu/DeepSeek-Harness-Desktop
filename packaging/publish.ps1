param([Parameter(Mandatory)][string]$Directory)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_REF_TYPE -eq 'branch') {
    $current = gh api "repos/$env:GITHUB_REPOSITORY/commits/main" --jq .sha
    if ($LASTEXITCODE -or $current -cne $env:GITHUB_SHA) { throw 'A newer main commit supersedes this preview build' }
}
$config = Get-Content packaging/preview.json -Raw | ConvertFrom-Json
$tag = "v$($config.version)"
if ($tag -cnotmatch '^v\d+\.\d+\.\d+-preview\.\d+$') { throw 'Expected a preview version' }
if ($env:GITHUB_REF_TYPE -eq 'tag' -and $env:GITHUB_REF_NAME -cne $tag) { throw 'Tag does not match preview version' }
$files = @('DSH-Desktop-Setup-x64.exe','SHA256SUMS.txt','ACCEPTANCE.md')
$paths = @($files | ForEach-Object { (Resolve-Path (Join-Path $Directory $_)).Path })
$digest = (Get-FileHash $paths[0] -Algorithm SHA256).Hash.ToLowerInvariant()
if ((Get-Content $paths[1] -Raw).Trim() -cne "$digest  DSH-Desktop-Setup-x64.exe") { throw 'Release hash mismatch' }
# Preserve any previously published release. Only resume drafts created for this exact run/commit.
$existing = gh release list --limit 100 --json tagName,isDraft | ConvertFrom-Json
if ($LASTEXITCODE) { throw 'Cannot list releases' }
$match = @($existing | Where-Object tagName -ceq $tag)
if ($match.Count) {
    $release = gh release view $tag --json isDraft,targetCommitish,assets | ConvertFrom-Json
    if ($LASTEXITCODE -or !$release.isDraft -or $release.targetCommitish -cne $env:GITHUB_SHA) { throw 'Release tag already in use' }
} else {
    gh release create $tag --target $env:GITHUB_SHA --title "DSH Desktop $tag · Windows x64 预览版" --draft --prerelease --latest=false --notes-file $paths[2]
    if ($LASTEXITCODE) { throw 'Cannot create draft release' }
}
gh release upload $tag @paths --clobber
if ($LASTEXITCODE) { throw 'Could not upload verified assets to draft' }
$release = gh release view $tag --json assets | ConvertFrom-Json
if ($LASTEXITCODE) { throw 'Cannot inspect draft assets' }
foreach ($path in $paths) {
    $asset = @($release.assets | Where-Object name -ceq (Split-Path -Leaf $path))
    $expected = 'sha256:' + (Get-FileHash $path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($asset.Count -ne 1 -or $asset[0].digest -cne $expected) { throw 'GitHub asset digest mismatch' }
}
gh release edit $tag --draft=false --prerelease --latest=false --notes-file $paths[2]
if ($LASTEXITCODE) { throw 'Could not publish verified preview' }
