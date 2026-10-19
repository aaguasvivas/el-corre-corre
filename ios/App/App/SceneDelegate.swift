import UIKit
import Capacitor

// The app's one window scene. Xcode 27 builds require the UIScene life
// cycle (Capacitor 8.5 adopts it). The scene manifest in Info.plist names
// Main.storyboard, so UIKit builds the window with GameViewController as the
// root before this delegate runs; nothing here creates a second window or a
// second bridge. Open-URL and user-activity events reach the scene now, not
// the AppDelegate, so they go to Capacitor's proxy.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
