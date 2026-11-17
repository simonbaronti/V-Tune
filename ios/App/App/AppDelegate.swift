import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    /// Whether we've been backgrounded at least once this launch — see
    /// applicationDidBecomeActive.
    private var hasBeenBackgrounded = false

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureAudioSession()
        return true
    }

    // MARK: - Audio session
    //
    // The moment the web layer opens the microphone, iOS moves the audio
    // session into .playAndRecord — and that category sends playback to the
    // earpiece, not the speaker. V-Tune holds the mic open the whole time
    // it's tuning, so the pitch pipe came out of the receiver at a fraction
    // of its volume. That was the first thing a user reported after launch:
    // "very quiet on my phone".
    //
    // Asking for .defaultToSpeaker at launch isn't enough on its own,
    // because the web view reconfigures the session for itself when capture
    // starts and stops — and each of those reconfigurations silently drops
    // both our option and any speaker override we'd applied. So the category
    // is re-applied whenever we come back to the foreground, and the speaker
    // is re-asserted on every route change.
    private func configureAudioSession() {
        applyCategory()

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(audioRouteChanged(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(audioSessionInterrupted(_:)),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )
    }

    /// Set the category we want, without activating the session.
    ///
    /// Deliberately no setActive(true) here: .playAndRecord isn't a mixing
    /// category, so activating it would stop whatever the user happens to be
    /// listening to the instant V-Tune launches. The web layer activates the
    /// session itself when it opens the mic, which is the moment the user
    /// actually asked for audio.
    private func applyCategory() {
        do {
            // .allowBluetoothA2DP covers AirPods and speakers for output.
            // .allowBluetooth is deliberately absent: it would also permit
            // an HFP headset as the *input*, and a mono 8 kHz microphone is
            // useless for measuring a handpan's partials.
            try AVAudioSession.sharedInstance().setCategory(
                .playAndRecord,
                options: [.defaultToSpeaker, .allowBluetoothA2DP]
            )
        } catch {
            // Non-fatal. The pipe is quiet, but the tuner still tunes.
        }
    }

    /// Push output to the speaker, but only when we'd otherwise be on the
    /// earpiece. Headphones, AirPods and car audio are all deliberate
    /// choices by the user and must be left alone.
    private func preferSpeakerIfOnReceiver() {
        let session = AVAudioSession.sharedInstance()
        let onReceiver = session.currentRoute.outputs.contains {
            $0.portType == .builtInReceiver
        }
        guard onReceiver else { return }
        try? session.overrideOutputAudioPort(.speaker)
    }

    @objc private func audioRouteChanged(_ notification: Notification) {
        // currentRoute often hasn't settled by the time this notification
        // arrives: read it synchronously and you can see the *old* route,
        // conclude there's nothing to fix, and return — just before the
        // route lands on the receiver with nothing left to correct it. That
        // was the "pipe stuck in the earpiece until you toggle Stop/Let's
        // Go" report. Check immediately for the common case, then check
        // again once the route has definitely settled.
        preferSpeakerIfOnReceiver()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.preferSpeakerIfOnReceiver()
        }
    }

    @objc private func audioSessionInterrupted(_ notification: Notification) {
        // Another app taking the audio session — a video in a social feed, a
        // call, an alarm — deactivates ours. Until it's activated again both
        // capture and playback are dead, which is why the microphone AND the
        // pitch pipe went together and why restarting the tuner from inside
        // the app didn't help: the web layer was rebuilding its graph on top
        // of a session the system had switched off.
        guard
            let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: raw),
            type == .ended
        else { return }

        // No .shouldResume check. That flag is documented as the signal to
        // resume *playback you were in the middle of*, and iOS routinely omits
        // it — in particular when the interruption ends while we're in the
        // background, which is every case that matters here. Gating on it is
        // why the first version of this fix did nothing at all.
        reactivate()
    }

    private func reactivate() {
        applyCategory()
        try? AVAudioSession.sharedInstance().setActive(true)
        preferSpeakerIfOnReceiver()
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        hasBeenBackgrounded = true
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Coming back from another app, the category may have been changed
        // out from under us and any speaker override cleared.
        //
        // Reactivating here as well as on the interruption notification isn't
        // belt and braces — the notification is genuinely unreliable. When an
        // interruption ends while we're in the background, .ended can arrive
        // without .shouldResume, arrive late, or never arrive at all. Coming
        // back to the foreground is the one moment we can count on.
        //
        // Gated on having actually been backgrounded so that launching the
        // app is untouched: .playAndRecord isn't a mixing category, so
        // activating it at launch would stop whatever the user was listening
        // to before they'd asked for anything.
        if hasBeenBackgrounded {
            reactivate()
        } else {
            applyCategory()
            preferSpeakerIfOnReceiver()
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

/// Scene lifecycle — required from the iOS 27 SDK on.
///
/// Built with the iOS 27 SDK, an app that still runs on the old app-delegate
/// lifecycle is killed at launch on iOS 27, before any of our code runs
/// (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`). 1.3.8
/// shipped that way: nothing in V-Tune changed, Xcode moved from 26.5 to 27.2
/// between 1.3.7 and 1.3.8, and the app stopped opening on every iOS 27 device.
///
/// Capacitor 8 doesn't provide a scene delegate, so this one does the minimum:
/// UIKit builds the window from Main.storyboard (Info.plist's scene manifest),
/// and every lifecycle event is handed to AppDelegate, which still owns the
/// audio session. Once scenes are adopted, UIKit stops calling the
/// app-delegate lifecycle methods itself — without the forwarding below,
/// the speaker/Bluetooth reactivation after backgrounding would silently stop.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    private var app: AppDelegate? { UIApplication.shared.delegate as? AppDelegate }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Cold launch from a link: UIKit delivers it here, not to openURLContexts.
        if !connectionOptions.urlContexts.isEmpty {
            self.scene(scene, openURLContexts: connectionOptions.urlContexts)
        }
        for activity in connectionOptions.userActivities {
            self.scene(scene, continue: activity)
        }
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        app?.applicationDidBecomeActive(UIApplication.shared)
    }

    func sceneWillResignActive(_ scene: UIScene) {
        app?.applicationWillResignActive(UIApplication.shared)
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        app?.applicationWillEnterForeground(UIApplication.shared)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        app?.applicationDidEnterBackground(UIApplication.shared)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
            if let source = context.options.sourceApplication {
                options[.sourceApplication] = source
            }
            options[.openInPlace] = context.options.openInPlace
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: options)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
