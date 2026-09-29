import UIKit
import Capacitor

// The root view controller of the game (set in Main.storyboard).
//
// El pedal sits in the bottom-left corner, and a thumb that lands near the
// bottom edge and slides up is the iOS go-home gesture. Deferring the bottom
// edge makes the first swipe there only reveal the home indicator; a second
// swipe still goes home, so the system gesture stays reachable. The indicator
// itself hides while nobody touches the screen near it.
class GameViewController: CAPBridgeViewController {
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        return .bottom
    }

    override var prefersHomeIndicatorAutoHidden: Bool {
        return true
    }
}
