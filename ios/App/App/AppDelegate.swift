import UIKit
import Capacitor

// With the scene manifest in Info.plist, iOS sends foreground, background,
// open-URL and user-activity events to SceneDelegate, not here. The game
// pauses itself on the web view's visibilitychange, so no native hook is
// needed for that.
@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    // The one scene configuration, matched by name to the Info.plist entry
    // (which supplies Main.storyboard).
    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {

        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

}
