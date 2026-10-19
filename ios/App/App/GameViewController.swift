import UIKit
import Capacitor

// The root view controller of the game (set in Main.storyboard).
//
// El pedal sits in the bottom-left corner, and a thumb that lands near the
// bottom edge and slides up is the iOS go-home gesture. Deferring the bottom
// edge makes the first swipe there only reveal the home indicator; a second
// swipe still goes home, so the system gesture stays reachable.
//
// The home indicator hides while nobody touches the screen near it. Since
// Capacitor 8 that is Capacitor's own SystemBars plugin
// (`plugins.SystemBars.hidden` in capacitor.config.json), which owns
// prefersHomeIndicatorAutoHidden on CAPBridgeViewController.
class GameViewController: CAPBridgeViewController {
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        return .bottom
    }
}
