await import('/assets/i18n.js');
const { validateBundleManifest } = await import('/assets/bundle-manifest.js');
const { validateBundlePatch } = await import('/assets/bundle-patch.js');
const { buildGitHubSubmissionUrl } = await import('/assets/github-submission.js');
const { evaluateRepository, findRegistryEntry, githubFailureMessage, manifestFailureMessage, parseGitHubRepository, repositoryCheckerCopy } = await import('/assets/repository-checker.js');
(function () {
  'use strict';
  var locale = window.HRI18N && window.HRI18N.locale === 'en-US' ? 'en-US' : 'zh-CN';
  var copy = repositoryCheckerCopy(locale);
  var submitLink = document.getElementById('github-submit');
  var reviewFields = document.getElementById('review-fields');
  var submissionActions = document.getElementById('submission-actions');
  var submissionHelp = document.getElementById('submission-help');
  var reviewSubmit = document.getElementById('review-submit');
  var checkedRepository = null;
  var checkedResult = null;
  var channel = { enabled: false, turnstileSiteKey: null };
  var turnstileToken = '';
  var turnstileWidgetId = null;
  var dynamicCopy = locale === 'en-US' ? {
    connecting: 'Connecting to the on-site review channel…', unavailable: 'On-site submission is not configured yet. Use the GitHub fallback for now.', ready: 'Complete the fields and verification, then submit without leaving this page.', submitting: 'Submitting to the review queue…', invalid: 'Complete the required fields and confirmations.', failed: 'Submission failed. Try again or use the GitHub fallback.', received: 'Review issue #{number} has been created and assigned to the maintainer.', duplicate: 'This repository is already tracked in review issue #{number}.', submit: 'Submit for review', retry: 'Try again'
  } : {
    connecting: '正在连接站内审核通道…', unavailable: '站内提交尚未配置完成，请暂时使用 GitHub 备用通道。', ready: '填写资料并完成人机验证后，即可留在本站提交。', submitting: '正在提交到审核队列…', invalid: '请填写必填资料并完成两项确认。', failed: '提交失败，请重试或使用 GitHub 备用通道。', received: '审核工单 #{number} 已创建并指派给维护者。', duplicate: '这个仓库已在审核工单 #{number} 中跟进。', submit: '提交审核', retry: '重新提交'
  };
  function setStep(active) {
    var order = ['check', 'details', 'submit', 'track'];
    var activeIndex = order.indexOf(active);
    document.querySelectorAll('#submission-stepper .step').forEach(function (step) {
      var index = order.indexOf(step.dataset.step);
      step.classList.toggle('done', index < activeIndex);
      step.classList.toggle('on', index === activeIndex);
    });
  }
  function disableSubmission() {
    checkedRepository = null; checkedResult = null; reviewFields.hidden = true; submissionActions.hidden = true;
    document.getElementById('submission-receipt').hidden = true; setStep('check');
  }
  function enableSubmission(repository, check) {
    submitLink.href = buildGitHubSubmissionUrl({ registryRepository: 'majiayu000/dsh-plugin-registry', repository: repository, check: check, locale: locale });
    checkedRepository = repository; checkedResult = check; reviewFields.hidden = false; submissionActions.hidden = false; setStep('details');
    if (channel.enabled) loadTurnstile(channel.turnstileSiteKey);
    updateSubmissionState();
  }
  document.getElementById('repo-input').addEventListener('input', disableSubmission);
  function setCheck(key, ok) {
    var row = document.querySelector('[data-check="' + key + '"]');
    row.classList.toggle('ok', ok);
    row.classList.toggle('fail', !ok);
    row.querySelector('.check-ic').textContent = ok ? '✓' : '×';
    row.querySelector('.check-state').textContent = ok ? copy.passed : copy.failed;
  }
  function resetChecks() {
    document.querySelectorAll('.check-row').forEach(function (row) {
      row.classList.remove('ok', 'fail');
      row.querySelector('.check-ic').textContent = '—';
      row.querySelector('.check-state').textContent = copy.pending;
    });
  }
  function loadTurnstile(siteKey) {
    if (!siteKey || window.turnstile) { if (window.turnstile && checkedRepository) renderTurnstile(siteKey); return; }
    var script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; script.defer = true;
    script.onload = function () { if (checkedRepository) renderTurnstile(siteKey); }; document.head.appendChild(script);
  }
  function renderTurnstile(siteKey) {
    if (!window.turnstile || !siteKey || turnstileWidgetId !== null) return;
    document.getElementById('turnstile-shell').hidden = false;
    turnstileWidgetId = window.turnstile.render('#turnstile-widget', { sitekey: siteKey, action: 'plugin_submission', theme: 'light', callback: function (token) { turnstileToken = token; updateSubmissionState(); }, 'expired-callback': function () { turnstileToken = ''; updateSubmissionState(); }, 'error-callback': function () { turnstileToken = ''; updateSubmissionState(); } });
  }
  function detailsValid() {
    var summary = document.getElementById('summary-input').value.trim();
    return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(document.getElementById('submitter-input').value.trim().replace(/^@/, '')) && summary.length >= 20 && summary.length <= 300 && document.getElementById('ownership-confirmed').checked && document.getElementById('public-review-confirmed').checked;
  }
  function updateSubmissionState() {
    var valid = Boolean(checkedRepository && channel.enabled && turnstileToken && detailsValid());
    reviewSubmit.disabled = !valid; reviewSubmit.querySelector('span').textContent = dynamicCopy.submit;
    submissionHelp.textContent = channel.enabled ? dynamicCopy.ready : dynamicCopy.unavailable;
    if (checkedRepository && detailsValid()) setStep('submit'); else if (checkedRepository) setStep('details');
  }
  async function configureSubmissionChannel() {
    submissionHelp.textContent = dynamicCopy.connecting;
    try {
      var response = await fetch('/api/submissions', { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('channel unavailable');
      channel = await response.json();
      if (channel.enabled) loadTurnstile(channel.turnstileSiteKey);
    } catch (_) { channel = { enabled: false, turnstileSiteKey: null }; }
    updateSubmissionState();
  }
  document.querySelectorAll('#review-fields input, #review-fields textarea').forEach(function (field) { field.addEventListener('input', updateSubmissionState); field.addEventListener('change', updateSubmissionState); });
  document.getElementById('summary-input').addEventListener('input', function () { document.getElementById('summary-count').textContent = String(this.value.length); });
  reviewSubmit.addEventListener('click', async function () {
    if (!detailsValid() || !turnstileToken || !checkedRepository) { submissionHelp.textContent = dynamicCopy.invalid; return; }
    reviewSubmit.disabled = true; reviewSubmit.querySelector('span').textContent = dynamicCopy.submitting; submissionHelp.textContent = dynamicCopy.submitting;
    try {
      var response = await fetch('/api/submissions', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ repository: checkedRepository, submitter: document.getElementById('submitter-input').value, summary: document.getElementById('summary-input').value, notes: document.getElementById('notes-input').value, website: document.getElementById('website-input').value, ownershipConfirmed: document.getElementById('ownership-confirmed').checked, publicReviewConfirmed: document.getElementById('public-review-confirmed').checked, turnstileToken: turnstileToken }) });
      var result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || dynamicCopy.failed);
      setStep('track'); reviewFields.hidden = true; submissionActions.hidden = true;
      var receipt = document.getElementById('submission-receipt'); receipt.hidden = false;
      document.getElementById('receipt-copy').textContent = (result.duplicate ? dynamicCopy.duplicate : dynamicCopy.received).replace('{number}', result.issueNumber);
      document.getElementById('receipt-link').href = result.issueUrl; receipt.focus();
    } catch (error) {
      turnstileToken = ''; if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId); updateSubmissionState();
      submissionHelp.textContent = error.message || dynamicCopy.failed; reviewSubmit.querySelector('span').textContent = dynamicCopy.retry;
    }
  });
  document.getElementById('repo-checker-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    var input = document.getElementById('repo-input');
    var button = document.getElementById('check-button');
    var repo = parseGitHubRepository(input.value);
    var message = document.getElementById('check-message');
    var results = document.getElementById('check-results');
    if (!repo) {
      input.setAttribute('aria-invalid', 'true');
      message.textContent = copy.invalidInput;
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    disableSubmission();
    button.disabled = true; button.textContent = copy.checking; results.hidden = false; message.textContent = '';
    this.setAttribute('aria-busy', 'true');
    resetChecks();
    try {
      var repoResponse = await fetch('https://api.github.com/repos/' + repo, { headers: { accept: 'application/vnd.github+json' } });
      if (!repoResponse.ok) { var repoError = new Error('repository fetch failed'); repoError.status = repoResponse.status; throw repoError; }
      var data = await repoResponse.json();
      var packageResponse = await fetch('https://api.github.com/repos/' + repo + '/contents/package.json', { headers: { accept: 'application/vnd.github.raw+json' } });
      var bundleCheck = { valid: false, reason_code: 'package_missing', reason: copy.packageMissing };
      if (packageResponse.ok) bundleCheck = validateBundleManifest(await packageResponse.text());
      else if (packageResponse.status !== 404) { var packageError = new Error('package fetch failed'); packageError.status = packageResponse.status; throw packageError; }
      var patchCheck = { valid: false, reason_code: 'patch_file_missing', reason: copy.patch_file_missing };
      if (bundleCheck.valid) {
        var patchResponse = await fetch('https://api.github.com/repos/' + repo + '/contents/' + bundleCheck.patch.replace(/^\.\//, ''), { headers: { accept: 'application/vnd.github.raw+json' } });
        if (patchResponse.ok) patchCheck = validateBundlePatch(await patchResponse.text());
        else if (patchResponse.status !== 404) { var patchError = new Error('patch fetch failed'); patchError.status = patchResponse.status; throw patchError; }
      }
      var registryEntry = null;
      try {
        var registryResponse = await fetch('data/plugins.json');
        if (registryResponse.ok) registryEntry = findRegistryEntry(await registryResponse.json(), repo);
      } catch (_) { /* Registry status is supplementary and must not block repository checks. */ }
      var check = evaluateRepository({ repository: data, bundleCheck: bundleCheck, patchCheck: patchCheck, registryEntry: registryEntry });
      var checkKeys = { repository_public: 'repo', discovery_topic: 'topic', bundle_manifest: 'bundle', bundle_patch: 'patch', repository_status: 'status' };
      check.signals.forEach(function (item) { setCheck(checkKeys[item.signal_type], item.signal.passed); });
      enableSubmission(repo, check);
      message.textContent = check.auto_discoverable
        ? copy.ready
        : (check.listing.listed && check.listing.source === 'curated'
          ? copy.curated
          : (!bundleCheck.valid ? manifestFailureMessage(bundleCheck, locale) : copy.incomplete));
    } catch (error) {
      results.hidden = true;
      message.textContent = githubFailureMessage(error.status, locale);
    }
    finally { button.disabled = false; button.textContent = copy.checkAgain; this.removeAttribute('aria-busy'); }
  });
  configureSubmissionChannel();
})();
