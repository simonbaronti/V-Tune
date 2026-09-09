import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

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
    // starts and stops. So we also watch for route changes and re-assert the
    // speaker whenever we find ourselves back on the receiver.
    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            // .allowBluetoothA2DP covers AirPods and speakers for output.
            // .allowBluetooth is deliberately absent: it would also permit
            // an HFP headset as the *input*, and a mono 8 kHz microphone is
            // useless for measuring a handpan's partials.
            try session.setCategory(
                .playAndRecord,
                options: [.defaultToSpeaker, .allowBluetoothA2DP]
            )
        } catch {
            // Non-fatal. The pipe is quiet, but the tuner still tunes.
        }

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(audioRouteChanged(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )
    }

    @objc private func audioRouteChanged(_ notification: Notification) {
        let session = AVAudioSession.sharedInstance()

        // Only override when we'd otherwise be on the earpiece. Headphones,
        // AirPods and car audio are all deliberate choices by the user and
        // must be left alone.
        let onReceiver = session.currentRoute.outputs.contains {
            $0.portType == .builtInReceiver
        }
        guard onReceiver else { return }

        try? session.overrideOutputAudioPort(.speaker)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
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
