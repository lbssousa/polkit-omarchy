// The agent's own strings live in plugin/i18n/, one flat catalog per Omarchy
// language code, read by Commons.Translations. A key missing from a catalog
// would quietly fall back to English, so every catalog carries them all.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const dir = path.join(__dirname, "..", "plugin", "i18n")

// The codes in Omarchy 4.5's default/i18n/locales.json.
const LANGUAGES = [
  "ar", "bg", "bn", "ca", "cs", "da", "de", "el", "en", "es-MX", "et", "fa",
  "fi", "fil", "fr", "ga", "he", "hi", "hr", "hu", "id", "is", "it", "ja",
  "ko", "lt", "lv", "ms", "nl", "no", "pl", "pt", "pt-BR", "ro", "ru", "si",
  "sk", "sl", "sr", "sv", "sw", "ta", "th", "tr", "uk", "ur", "uz", "vi",
  "zh-CN", "zh-TW",
]

const files = fs.readdirSync(dir).sort()
const catalog = (code) => JSON.parse(fs.readFileSync(path.join(dir, `${code}.json`), "utf8"))
const english = catalog("en")

test("there is one catalog per Omarchy language", () => {
  assert.deepEqual(files, LANGUAGES.map((code) => `${code}.json`).sort())
})

test("the language list matches the installed Omarchy, when there is one", (t) => {
  const registry = [process.env.OMARCHY_PATH, "/usr/share/omarchy"]
    .filter(Boolean)
    .map((root) => path.join(root, "default", "i18n", "locales.json"))
    .find((file) => fs.existsSync(file))
  if (!registry) return t.skip("Omarchy isn't installed")
  const codes = Object.keys(JSON.parse(fs.readFileSync(registry, "utf8")))
  assert.deepEqual(codes.sort(), [...LANGUAGES].sort())
})

test("English names the strings the agent asks for", () => {
  assert.deepEqual(english, {
    "polkit.touchSecurityKey": "Touch your security key",
    "polkit.enterPin": "Enter PIN",
  })
})

test("every catalog translates every string", () => {
  for (const code of LANGUAGES) {
    const strings = catalog(code)
    assert.deepEqual(Object.keys(strings).sort(), Object.keys(english).sort(), code)
    for (const [key, value] of Object.entries(strings)) {
      assert.equal(typeof value, "string", `${code} ${key}`)
      assert.ok(value.trim().length > 0, `${code} ${key}`)
      assert.equal(value, value.trim(), `${code} ${key}`)
    }
  }
})
