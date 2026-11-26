import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.Polkit
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "PolkitModel.js" as PolkitModel

Item {
  id: root

  // This agent's own strings (plugin/i18n/), in the language picked under
  // Setup > Language. The ones it shares with omarchy.polkit come from I18n.
  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  property string fontFamily: Style.font.menuFamily
  // Bound to the central [polkit] section in shell.toml via Commons.Color.qml.
  property color accent: Commons.Color.polkit.accent
  property color background: Commons.Color.polkit.background
  property color foreground: Commons.Color.polkit.text
  property color border: Commons.Color.polkit.border
  property color borderError: Commons.Color.polkit.borderError
  property var borderSpec: Border.surfaceSpec("polkit", showingError ? "border-error" : "border", showingError ? borderError : border, Math.max(1, Style.space(2)), "border-alpha")
  property color scrim: Commons.Color.polkit.scrim
  readonly property int cornerRadius: Style.cornerRadius
  property int contentMargin: Style.spacing.panelPadding
  property int fieldHeight: Math.max(Style.space(42), Style.spacing.controlHeight)

  // Set immediately on polkit auth success or cancel so the overlay drops its
  // exclusive keyboard focus and pointer grab without waiting for polkitd to
  // finish tearing down the D-Bus flow.
  property bool dismissed: false
  property bool submitted: false
  property string currentMessage: ""
  // What a command asked its next prompt to say, as it knows what it's for
  // and pkexec names only the program: one prompt, for that program, within
  // a minute. Taken by the prompt it fits, which keeps it as currentLabel.
  property var expected: null
  property string currentLabel: ""
  // The coding agent a prompt comes from ({ mark, name, light }), whose icon
  // in the agents plugin takes the padlock's place. Looked up per prompt, and
  // the padlock waits for the answer so it doesn't flash before the mark.
  property var currentAgent: null
  property bool requesterPending: false
  property int requestSerial: 0
  readonly property url agentMarkSource: {
    if (!currentAgent) return ""
    var suffix = currentAgent.light && Util.luminance(background) >= 0.5 ? "-light.svg" : ".svg"
    // Omarchy's own agents plugin, not a path next to this one: the plugin
    // lives outside $OMARCHY_PATH/shell/plugins.
    return "file://" + Quickshell.env("OMARCHY_PATH") + "/shell/plugins/agents/assets/" + currentAgent.mark + suffix
  }
  property string currentPrompt: ""
  property string currentSupplementary: ""
  property bool responseRequired: false
  property bool responseVisible: false
  property bool failed: false
  property bool errorFlash: false
  // A fingerprint scan that didn't work: the glyph and border turn red and the
  // card shakes, as for a wrong password, but the dialog stays in fingerprint
  // mode (errorFlash would leave it) while pam_fprintd waits for the next try.
  property bool fingerprintFlash: false
  // pam_fprintd's own message for it ("Failed to match fingerprint", in the
  // user's language), shown in place of the authorization label for a moment.
  property string fingerprintNotice: ""
  // The last PAM message checked for a failed scan, with its error flag: the
  // two arrive as separate signals, and a repeat isn't a new scan.
  property string lastSupplementaryKey: ""
  readonly property bool showingError: errorFlash || fingerprintFlash
  // pam_fprintd appears in the polkit PAM stack (a sensor is enrolled).
  property bool fingerprintConfigured: false
  // pam_u2f appears in the polkit PAM stack (a FIDO security key is set up).
  property bool securityKeyConfigured: false
  // pam_u2f comes before pam_fprintd, so it is the module PAM waits on first.
  property bool securityKeyFirst: false
  // pam_u2f's cue_prompt= values, so a custom cue still shows the key.
  property var securityKeyCues: []
  // Lid shut right now — the reader is physically unreachable, so we fall back
  // to the password even when a sensor is enrolled. Refreshed per request.
  property bool laptopClosed: false
  property int shakeOffset: 0
  // The encrypted drive being asked for (omarchy-drive-unlock), not polkit:
  // the card unlocks it with the password itself, so a wrong one is asked again.
  property string driveDevice: ""
  property string driveLabel: ""
  // Drives waiting their turn, as { device, label }: one card at a time.
  property var driveQueue: []

  readonly property bool dialogVisible: (polkitAgent.isActive && !dismissed) || driveDevice !== ""
  // We show one method at a time. Fingerprint owns the dialog while PAM is
  // waiting on the reader (lid open, sensor enrolled); the moment PAM asks for
  // a password — including immediately when the lid is shut and the clamshell
  // gate skips pam_fprintd — we switch to the password field instead.
  // pam_u2f blocks until the key is touched and asks for nothing — at most a
  // PAM info message ("Please touch the device." with `cue`). Show that
  // instead of a password field whose Enter would do nothing. The decision is
  // in PolkitModel.js, where tests check that a password prompt from PAM is
  // never hidden.
  readonly property var modeState: ({
    dialogVisible: dialogVisible,
    responseRequired: responseRequired,
    submitted: submitted,
    errorFlash: errorFlash,
    supplementary: currentSupplementary,
    securityKeyConfigured: securityKeyConfigured,
    securityKeyFirst: securityKeyFirst,
    securityKeyCues: securityKeyCues,
    fingerprintConfigured: fingerprintConfigured,
    laptopClosed: laptopClosed
  })
  readonly property bool securityKeyMode: PolkitModel.securityKeyMode(modeState)
  readonly property bool fingerprintMode: PolkitModel.fingerprintMode(modeState)
  readonly property bool promptAsksPin: PolkitModel.promptAsksPin(currentPrompt)

  // A hidden field keeps keyboard focus, so move it off the password field
  // when the key takes over and drop what was typed there: otherwise typing
  // during the touch wait went into it, hid the instruction and was sent
  // with the next password. (Upstream: omacom/omarchy 73c3601e, PR #16094.)
  onSecurityKeyModeChanged: {
    if (securityKeyMode) {
      passwordInput.text = ""
      keyCatcher.forceActiveFocus()
    } else {
      Qt.callLater(refocus)
    }
  }
  readonly property int cardHeight: panel.height > 0 ? Math.min(fieldHeight + contentMargin * 2, panel.height - Style.gapsOut * 2) : fieldHeight + contentMargin * 2
  // Password mode is a wide field; fingerprint mode collapses to a square that
  // just frames the centered sensor icon; the security key prompt widens to
  // fit its instruction, which is longer in some languages ("Toque na sua
  // chave de segurança"), up to the screen's width. The instruction is
  // measured by a hidden Text laid out like the shown one: TextMetrics'
  // advanceWidth can fall short of the width a Text needs to not elide.
  readonly property int securityKeyCardWidth: Math.ceil(touchMeasure.implicitWidth + Style.space(40) + card.contentLeftInset + card.contentRightInset)
  readonly property int cardWidth: fingerprintMode ? cardHeight : Math.min(securityKeyMode ? Math.max(Style.space(400), securityKeyCardWidth) : Style.space(312), Math.max(Style.space(260), panel.width - Style.gapsOut * 2))

  Text {
    id: touchMeasure
    visible: false
    textFormat: Text.PlainText
    font.family: root.fontFamily
    font.pixelSize: Style.font.iconLarge
    text: strings.t("polkit.touchSecurityKey")
  }

  // A pkexec prompt always shows what it runs on a dimmer second line under
  // either the caller's reason or the default authorization heading.
  function authorizationLabel(message) {
    var label = PolkitModel.singleLine(currentLabel)
    if (label !== "") return label
    var text = message ? PolkitModel.authorizationLabel(message, I18n.t, currentAgent ? currentAgent.name : "") : ""
    return text !== "" ? text : I18n.t("polkit.authenticationNeeded")
  }

  // The command a pkexec prompt runs, shown on the second line under the heading.
  readonly property string labelProgram: PolkitModel.singleLine(PolkitModel.promptProgram(currentMessage))

  ShellIpc {
    target: "omarchy.polkit"
    function expect(program: string, label: string): string {
      root.expected = { program: program, label: label, until: Date.now() + 60000 }
      return "ok"
    }
    function unlockDrive(device: string, label: string): string {
      root.queueDrive(device, label)
      return "ok"
    }
  }

  function loadPamConfig(raw) {
    fingerprintConfigured = PolkitModel.fingerprintConfiguredFromPamConfig(raw)
    securityKeyConfigured = PolkitModel.securityKeyConfiguredFromPamConfig(raw)
    securityKeyFirst = PolkitModel.passiveAuthModules(raw)[0] === "security-key"
    securityKeyCues = PolkitModel.securityKeyCuesFromPamConfig(raw)
  }

  function refreshLidState() {
    if (!laptopClosedProc.running) laptopClosedProc.running = true
  }

  function clearRequester() {
    currentAgent = null
    requesterPending = false
    requesterTimeout.stop()
    // A lookup still running is for a prompt that's gone, not for what comes
    // next, a drive's card included.
    requestSerial++
  }

  function resetSnapshot() {
    currentMessage = ""
    currentLabel = ""
    clearRequester()
    currentPrompt = ""
    currentSupplementary = ""
    responseRequired = false
    responseVisible = false
    failed = false
    errorFlash = false
    clearFingerprintFeedback()
    lastSupplementaryKey = ""
    submitted = false
    passwordInput.text = ""
  }

  function syncFromFlow() {
    var flow = polkitAgent.flow
    if (!flow) return

    currentMessage = String(flow.message || "")
    currentPrompt = String(flow.inputPrompt || "")
    var supplementary = String(flow.supplementaryMessage || "")
    var messageChanged = supplementary !== currentSupplementary
    currentSupplementary = supplementary
    responseRequired = !!flow.isResponseRequired
    responseVisible = !!flow.responseVisible
    failed = !!flow.failed

    submitted = PolkitModel.stillSubmitted({
      submitted: submitted,
      responseRequired: responseRequired,
      supplementary: supplementary,
      securityKeyCues: securityKeyCues,
      messageChanged: messageChanged
    })
    // Once both the message and its error flag have arrived.
    Qt.callLater(checkFingerprintFeedback)
  }

  function checkFingerprintFeedback() {
    var flow = polkitAgent.flow
    if (!flow) return
    var supplementary = String(flow.supplementaryMessage || "")
    var isError = !!flow.supplementaryIsError
    var key = (isError ? "error:" : "info:") + supplementary
    if (key === lastSupplementaryKey) return
    lastSupplementaryKey = key
    if (PolkitModel.fingerprintScanFailed({
      fingerprintMode: fingerprintMode,
      supplementary: supplementary,
      supplementaryIsError: isError,
      securityKeyCues: securityKeyCues
    })) triggerFingerprintFeedback(supplementary)
  }

  function triggerFingerprintFeedback(message) {
    fingerprintFlash = true
    fingerprintNotice = message.replace(/^\s+|\s+$/g, "")
    fingerprintFlashTimer.restart()
    fingerprintNoticeTimer.restart()
    shakeAnimation.restart()
  }

  function clearFingerprintFeedback() {
    fingerprintFlashTimer.stop()
    fingerprintNoticeTimer.stop()
    fingerprintFlash = false
    fingerprintNotice = ""
  }

  function queueDrive(device, label) {
    if (device === driveDevice || driveQueue.some(function(d) { return d.device === device })) return
    driveQueue = driveQueue.concat([{ device: device, label: label }])
    nextDrive()
  }

  function nextDrive() {
    if (driveDevice !== "" || (polkitAgent.isActive && !dismissed) || driveQueue.length === 0) return
    var next = driveQueue[0]
    driveQueue = driveQueue.slice(1)
    beginDrive(next.device, next.label)
  }

  function beginDrive(device, label) {
    resetSnapshot()
    driveDevice = device
    driveLabel = label
    currentLabel = I18n.t("polkit.unlockDrive").replace("%1", label)
    responseRequired = true
    Qt.callLater(refocus)
  }

  function driveChecked(device, exitCode, error) {
    if (exitCode === 0) driveQueue = driveQueue.filter(function(d) { return d.device !== device })
    // An answer for a drive no longer asked for (cancelled, or set aside for polkit).
    if (device !== driveDevice) return
    if (exitCode !== 0 && /Incorrect passphrase|No passphrase/.test(error)) {
      triggerFailureFeedback()
      return
    }
    if (exitCode !== 0) console.warn("omarchy drive unlock failed: " + error.trim())
    driveDevice = ""
    resetSnapshot()
    nextDrive()
  }

  function beginFlow() {
    // Polkit's own request takes the card; a drive being asked for waits first in line.
    if (driveDevice !== "") {
      driveQueue = [{ device: driveDevice, label: driveLabel }].concat(driveQueue)
      driveDevice = ""
    }
    // A new request starts fresh even if the previous flow is still tearing down.
    dismissed = false
    submitted = false
    passwordInput.text = ""
    clearFingerprintFeedback()
    lastSupplementaryKey = ""
    refreshLidState()
    syncFromFlow()
    // Each request takes the label it was expected with, or none, so one
    // arriving while the last dialog closes doesn't keep the last label. It is
    // taken here and not in syncFromFlow, which runs first: Quickshell sets the
    // flow, and with it isActive, before it says the request started.
    currentLabel = PolkitModel.expectedLabel(currentMessage, expected, Date.now())
    if (currentLabel !== "") expected = null
    findRequester()
    Qt.callLater(refocus)
  }

  // Only a pkexec prompt names the command line its process can be found by.
  // A lookup that hangs gives the padlock back after a second.
  function findRequester() {
    clearRequester()
    requesterPending = PolkitModel.promptProgram(currentMessage) !== ""
    if (!requesterPending) return
    requesterTimeout.restart()
    lookUpRequester()
  }

  // One lookup runs at a time: a prompt that starts while the last one's
  // still runs gets its own when that ends.
  function lookUpRequester() {
    if (requesterProc.running) return
    requesterProc.forSerial = requestSerial
    requesterProc.command = ["python3", Quickshell.env("OMARCHY_PATH") + "/shell/plugins/polkit/requester.py", PolkitModel.promptProgram(currentMessage)]
    requesterProc.running = true
  }

  function dismissPolkit() {
    dismissed = true
    // A queued drive may already have taken the card if cancelRequest() ran first.
    if (driveDevice === "") {
      resetSnapshot()
      nextDrive()
    }
  }

  function refocus() {
    if (!dialogVisible) return
    // In fingerprint mode there is no field to type into — park focus on the
    // key catcher so Escape still cancels; otherwise focus the password field.
    if (fingerprintMode || securityKeyMode) keyCatcher.forceActiveFocus()
    else passwordInput.forceActiveFocus()
  }

  function submitResponse() {
    if (driveDevice !== "") {
      if (submitted) return
      submitted = true
      errorFlash = false
      driveUnlock.secret = passwordInput.text
      driveUnlock.device = driveDevice
      driveUnlock.command = ["udisksctl", "unlock", "--no-user-interaction", "--block-device", driveDevice, "--key-file", "/dev/stdin"]
      driveUnlock.stdinEnabled = true
      driveUnlock.running = true
      passwordInput.text = ""
      keyCatcher.forceActiveFocus()
      return
    }
    var flow = polkitAgent.flow
    if (!flow || !flow.isResponseRequired) return
    submitted = true
    errorFlash = false
    flow.submit(passwordInput.text)
    passwordInput.text = ""
    keyCatcher.forceActiveFocus()
  }

  function cancelRequest() {
    var flow = polkitAgent.flow
    var hadDrive = driveDevice !== ""
    driveDevice = ""
    if (!hadDrive && polkitAgent.isActive) dismissed = true
    resetSnapshot()
    if (!hadDrive && flow) flow.cancelAuthenticationRequest()
    nextDrive()
  }

  function triggerFailureFeedback() {
    submitted = false
    errorFlash = true
    passwordInput.text = ""
    errorTimer.restart()
    shakeAnimation.restart()
    Qt.callLater(refocus)
  }

  Timer {
    id: errorTimer
    interval: 1200
    repeat: false
    onTriggered: root.errorFlash = false
  }

  Timer {
    id: fingerprintFlashTimer
    interval: 1200
    repeat: false
    onTriggered: root.fingerprintFlash = false
  }

  // Longer than the flash: the message has to be read. It also outlives the
  // fingerprint state when that was the last try, saying why the dialog moved
  // on to the security key or the password.
  Timer {
    id: fingerprintNoticeTimer
    interval: 3000
    repeat: false
    onTriggered: root.fingerprintNotice = ""
  }

  SequentialAnimation {
    id: shakeAnimation
    NumberAnimation { target: root; property: "shakeOffset"; to: -8; duration: Style.duration(35); easing.type: Easing.OutQuad }
    NumberAnimation { target: root; property: "shakeOffset"; to: 8; duration: Style.duration(50); easing.type: Easing.InOutQuad }
    NumberAnimation { target: root; property: "shakeOffset"; to: 0; duration: Style.duration(55); easing.type: Easing.OutQuad }
  }
  FileView {
    path: "/etc/pam.d/polkit-1"
    watchChanges: true
    printErrors: false
    onLoaded: root.loadPamConfig(text())
    onLoadFailed: {
      root.fingerprintConfigured = false
      root.securityKeyConfigured = false
      root.securityKeyFirst = false
      root.securityKeyCues = []
    }
    onFileChanged: reload()
  }

  Process {
    id: requesterProc
    property int forSerial: 0
    stdout: StdioCollector { id: requesterOut; waitForEnd: true }
    onExited: {
      if (forSerial === root.requestSerial) {
        requesterTimeout.stop()
        if (root.dialogVisible) root.currentAgent = PolkitModel.parseRequester(requesterOut.text)
        root.requesterPending = false
      } else if (root.requesterPending) {
        Qt.callLater(root.lookUpRequester)
      }
    }
  }

  Timer {
    id: requesterTimeout
    interval: 1000
    repeat: false
    onTriggered: {
      root.requestSerial++
      root.requesterPending = false
    }
  }

  Process {
    id: laptopClosedProc
    command: ["bash", "-c", "omarchy-hw-laptop-closed && echo closed || echo open"]
    stdout: StdioCollector { id: laptopClosedOut; waitForEnd: true }
    onExited: root.laptopClosed = String(laptopClosedOut.text || "").trim() === "closed"
  }

  // The password goes over stdin, never argv, and closing stdin ends it.
  Process {
    id: driveUnlock
    property string secret: ""
    property string device: ""
    stderr: StdioCollector { id: driveUnlockError; waitForEnd: true }
    onStarted: {
      write(secret)
      secret = ""
      stdinEnabled = false
    }
    onExited: function(exitCode) { root.driveChecked(device, exitCode, String(driveUnlockError.text || "")) }
  }

  PolkitAgent {
    id: polkitAgent
    path: "/org/omarchy/PolkitAgent"

    onAuthenticationRequestStarted: root.beginFlow()
    onIsActiveChanged: {
      if (isActive) root.syncFromFlow()
      else {
        root.dismissed = false
        if (root.driveDevice === "") {
          root.resetSnapshot()
          root.nextDrive()
        }
      }
    }
    onIsRegisteredChanged: {
      if (isRegistered) console.log("omarchy polkit agent registered")
      else console.warn("omarchy polkit agent is not registered; another agent may be running")
    }
  }

  Connections {
    target: polkitAgent.flow

    function onIsResponseRequiredChanged() {
      root.syncFromFlow()
      if (!polkitAgent.flow || !polkitAgent.flow.isResponseRequired) passwordInput.text = ""
      Qt.callLater(root.refocus)
    }

    function onInputPromptChanged() { root.syncFromFlow() }
    function onResponseVisibleChanged() { root.syncFromFlow() }
    function onSupplementaryMessageChanged() { root.syncFromFlow() }
    function onFailedChanged() { root.syncFromFlow() }

    function onAuthenticationFailed() {
      root.syncFromFlow()
      root.triggerFailureFeedback()
    }

    function onAuthenticationSucceeded() {
      root.dismissPolkit()
    }

    function onAuthenticationRequestCancelled() {
      root.dismissPolkit()
    }
  }

  PanelWindow {
    id: panel
    // Right-to-left languages read this window mirrored.
    Binding { target: panel.contentItem; property: "LayoutMirroring.enabled"; value: Commons.I18n.rightToLeft }
    Binding { target: panel.contentItem; property: "LayoutMirroring.childrenInherit"; value: true }

    visible: root.dialogVisible
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "omarchy-polkit"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
    exclusionMode: ExclusionMode.Ignore

    Rectangle {
      anchors.fill: parent
      color: root.scrim
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.refocus()
    }

    BorderSurface {
      id: card
      width: root.cardWidth
      height: root.cardHeight
      radius: root.cornerRadius
      anchors.centerIn: parent
      anchors.horizontalCenterOffset: root.shakeOffset
      color: root.background
      borderSpec: root.borderSpec
      padding: root.contentMargin

      MouseArea { anchors.fill: parent; onClicked: root.refocus() }

      Item {
        id: keyCatcher
        anchors.fill: parent
        focus: true

        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) {
          if (event.key === Qt.Key_Escape) {
            root.cancelRequest()
            event.accepted = true
          } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
            if (root.responseRequired) root.submitResponse()
            event.accepted = true
          }
        }
      }

      // Fingerprint mode shows just the sensor icon, centered and alone \u2014 no
      // padlock, no field, no prompt text.
      OpticalGlyph {
        anchors.centerIn: parent
        width: Math.round(root.fieldHeight * 0.7)
        height: width
        visible: root.fingerprintMode
        text: "\udb80\ude37"
        fontFamily: root.fontFamily
        fontSize: Math.round(root.fieldHeight * 0.7)
        color: root.showingError ? Commons.Color.polkit.textError : root.accent
      }

      Row {
        id: cardRow
        visible: !root.fingerprintMode
        anchors.fill: parent
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        anchors.leftMargin: card.contentLeftInset
        spacing: Style.space(14)

        Item {
          width: Style.space(26)
          height: root.fieldHeight

          // The agent the request comes from, unless the security key is
          // being waited on: then its pulsing key takes the place.
          Image {
            id: agentMark
            anchors.centerIn: parent
            width: Style.font.iconLarge
            height: width
            source: root.agentMarkSource
            sourceSize.width: width * 2
            sourceSize.height: height * 2
            fillMode: Image.PreserveAspectFit
            visible: status === Image.Ready && !root.securityKeyMode
          }

          Text {
            id: methodIcon
            anchors.fill: parent
            visible: root.securityKeyMode || (!agentMark.visible && !root.requesterPending)
            // Padlock for the password, a key while waiting for the security key.
            text: root.securityKeyMode ? "\udb80\udf06" : "\uf023"
            color: root.errorFlash ? Commons.Color.polkit.textError : root.accent

            SequentialAnimation on opacity {
              running: root.securityKeyMode
              loops: Animation.Infinite
              onStopped: methodIcon.opacity = 1
              NumberAnimation { to: 0.35; duration: Style.duration(700); easing.type: Easing.InOutSine }
              NumberAnimation { to: 1; duration: Style.duration(700); easing.type: Easing.InOutSine }
            }
            font.family: root.fontFamily
            font.pixelSize: Style.font.iconLarge
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
          }
        }

        Item {
          width: parent.width - Style.space(40)
          height: root.fieldHeight

          TextInput {
            id: passwordInput
            anchors.fill: parent
            visible: !root.securityKeyMode
            verticalAlignment: TextInput.AlignVCenter
            activeFocusOnPress: true
            clip: true
            selectionColor: Util.alpha(root.accent, 0.45)
            selectedTextColor: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.iconLarge
            echoMode: root.responseVisible ? TextInput.Normal : TextInput.Password
            passwordCharacter: "\u2022"
            color: root.errorFlash ? Commons.Color.polkit.textError : root.foreground
            cursorVisible: activeFocus && !root.submitted && !root.errorFlash
            readOnly: root.submitted || root.errorFlash
            enabled: root.dialogVisible
            onAccepted: root.submitResponse()
            Keys.onPressed: function(event) {
              if (event.key === Qt.Key_Escape) {
                root.cancelRequest()
                event.accepted = true
              }
            }
          }

          Text {
            textFormat: Text.PlainText
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            text: root.errorFlash ? I18n.t("polkit.wrong")
              : root.securityKeyMode ? strings.t("polkit.touchSecurityKey")
              : root.submitted ? I18n.t("polkit.checking")
              : root.promptAsksPin ? strings.t("polkit.enterPin") : I18n.t("polkit.enterPassword")
            color: root.errorFlash ? Commons.Color.polkit.textError : root.foreground
            opacity: root.errorFlash || root.securityKeyMode ? 1 : 0.36
            font.family: root.fontFamily
            font.pixelSize: Style.font.iconLarge
            elide: Text.ElideRight
            visible: passwordInput.text.length === 0
          }

          Rectangle {
            width: Math.max(1, Style.space(2))
            height: Style.space(24)
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            color: root.errorFlash ? Commons.Color.polkit.textError : root.foreground
            visible: passwordInput.visible && passwordInput.activeFocus && passwordInput.text.length === 0 && !root.submitted && !root.errorFlash
          }

          MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.LeftButton
            enabled: passwordInput.visible
            onClicked: passwordInput.forceActiveFocus()
          }
        }
      }
    }

    Rectangle {
      // Waits for the agent with the mark when its line names it, unless a
      // label is already known.
      visible: !root.requesterPending || PolkitModel.singleLine(root.currentLabel) !== ""
      // Measured apart from the lines, whose width follows this one.
      width: {
        var labelWidth = Math.max(labelMetrics.advanceWidth, labelMetrics.boundingRect.width)
        var programWidth = root.labelProgram !== "" ? Math.max(programMetrics.advanceWidth, programMetrics.boundingRect.width) : 0
        var naturalWidth = Math.ceil(Math.max(labelWidth, programWidth)) + Style.space(24)
        return panel.width > 0 ? Math.min(naturalWidth, Math.max(0, panel.width - Style.gapsOut * 2)) : naturalWidth
      }
      height: Math.max(Style.space(28), justificationLines.implicitHeight + Style.space(root.labelProgram !== "" ? 16 : 10))
      anchors.horizontalCenter: card.horizontalCenter
      anchors.bottom: card.top
      anchors.bottomMargin: Style.space(10)
      radius: root.cornerRadius
      color: root.background
      clip: true

      TextMetrics { id: labelMetrics; font: justificationText.font; text: justificationText.text }
      TextMetrics { id: programMetrics; font: programText.font; text: programText.text }

      Column {
        id: justificationLines
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: Style.space(12)
        anchors.rightMargin: Style.space(12)
        spacing: Style.space(3)

        Text {
          id: justificationText
          textFormat: Text.PlainText
          width: parent.width
          maximumLineCount: 1
          text: root.fingerprintNotice !== "" ? root.fingerprintNotice : root.authorizationLabel(root.currentMessage)
          color: root.fingerprintNotice !== "" ? Commons.Color.polkit.textError : root.foreground
          font.family: root.fontFamily
          font.pixelSize: root.labelProgram !== "" ? Style.font.body : Style.font.bodySmall
          horizontalAlignment: Text.AlignHCenter
          elide: root.labelProgram !== "" ? Text.ElideRight : Text.ElideMiddle
        }

        Text {
          id: programText
          textFormat: Text.PlainText
          width: parent.width
          maximumLineCount: 1
          visible: text !== "" && root.fingerprintNotice === ""
          text: root.labelProgram
          color: root.foreground
          opacity: 0.6
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          horizontalAlignment: Text.AlignHCenter
          elide: Text.ElideMiddle
        }
      }
    }
  }
}
