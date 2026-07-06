const index = await fetch("https://signalyz.ai/").then((r) => r.text());
const bundleMatch = index.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
const js = bundleMatch
  ? await fetch(`https://signalyz.ai/assets/index-${bundleMatch[1]}.js`).then((r) => r.text())
  : "";
const exportShadowMatch = js.match(/exportValidationShadow-([A-Za-z0-9_-]+)\.js/);
const exportShadowJs = exportShadowMatch
  ? await fetch(`https://signalyz.ai/assets/exportValidationShadow-${exportShadowMatch[1]}.js`).then((r) => r.text())
  : "";
const stdShadowMatch = exportShadowJs.match(/signalyzedStandardShadow-([A-Za-z0-9_-]+)\.js/);
const stdShadowJs = stdShadowMatch
  ? await fetch(`https://signalyz.ai/assets/signalyzedStandardShadow-${stdShadowMatch[1]}.js`).then((r) => r.text())
  : "";
console.log(
  JSON.stringify(
    {
      bundle: bundleMatch?.[0],
      exportShadow: exportShadowMatch ? `exportValidationShadow-${exportShadowMatch[1]}.js` : null,
      stdShadow: stdShadowMatch ? `signalyzedStandardShadow-${stdShadowMatch[1]}.js` : null,
      repairInStdShadow: /signalyzed_repair_candidate_report|preserve_high_value_bullet/.test(stdShadowJs),
    },
    null,
    2,
  ),
);
