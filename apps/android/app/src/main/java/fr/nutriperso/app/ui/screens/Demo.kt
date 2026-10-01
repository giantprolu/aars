package fr.nutriperso.app.ui.screens

/**
 * Contenus d'exemple des maquettes (Annexe/mobile), pour les écrans dont les
 * lectures ne sont pas encore branchées : Cuisine, Sport, Communauté,
 * Progression. Ils seront remplacés écran par écran par l'API ; le README de
 * la maquette précise que noms, chiffres et salle sont des exemples.
 */
object Demo {
    data class PlanCell(val label: String?, val state: CellState)
    enum class CellState { Empty, Planned, Today, Past, None }
    data class PlanDay(val label: String, val today: Boolean, val lunch: PlanCell, val dinner: PlanCell)

    val dishes = listOf("Curry de lentilles" to "2/4", "Saumon, patate douce" to "2/2", "Chili sin carne" to "2/3")

    val week = listOf(
        PlanDay("Lun 29", false, PlanCell(null, CellState.None), PlanCell("Saumon", CellState.Past)),
        PlanDay("Mar 30", true, PlanCell("Chili", CellState.Past), PlanCell("Curry · manger", CellState.Today)),
        PlanDay("Mer 1", false, PlanCell(null, CellState.Empty), PlanCell("Chili", CellState.Planned)),
        PlanDay("Jeu 2", false, PlanCell("Curry", CellState.Planned), PlanCell(null, CellState.Empty)),
        PlanDay("Ven 3", false, PlanCell(null, CellState.Empty), PlanCell("Saumon", CellState.Planned)),
        PlanDay("Sam 4", false, PlanCell(null, CellState.Empty), PlanCell(null, CellState.Empty)),
        PlanDay("Dim 5", false, PlanCell(null, CellState.Empty), PlanCell(null, CellState.Empty)),
    )

    data class Recipe(val name: String, val kcal: Int, val minutes: Int)

    val recipes = listOf(
        Recipe("Curry de lentilles", 520, 35),
        Recipe("Saumon, patate douce", 610, 30),
        Recipe("Chili sin carne", 480, 40),
        Recipe("Poke bowl au thon", 560, 20),
        Recipe("Omelette aux épinards", 390, 10),
        Recipe("Gratin de courgettes", 430, 45),
    )

    data class ShoppingItem(val name: String, val quantity: String, val checked: Boolean)

    val aisles = listOf(
        "Fruits et légumes" to listOf(
            ShoppingItem("Patates douces", "800 g", true),
            ShoppingItem("Épinards", "300 g", false),
            ShoppingItem("Oignons", "3", true),
            ShoppingItem("Citron vert", "2", false),
        ),
        "Épicerie" to listOf(
            ShoppingItem("Lentilles corail", "500 g", true),
            ShoppingItem("Lait de coco", "40 cl", false),
            ShoppingItem("Haricots rouges", "2 boîtes", true),
        ),
        "Frais" to listOf(
            ShoppingItem("Pavés de saumon", "2", false),
            ShoppingItem("Yaourt grec", "4", true),
        ),
    )

    data class Exercise(val name: String, val detail: String)

    val todaySession = "Haut du corps A" to listOf(
        Exercise("Développé couché", "4 × 8 · 70 kg"),
        Exercise("Tirage vertical + Dips", "3 × 10"),
        Exercise("Élévations latérales", "3 × 12"),
        Exercise("Curl marteau", "3 × 12"),
    )

    data class Program(val name: String, val detail: String, val favorite: Boolean)

    val program = listOf(
        Program("Bas du corps A", "6 exercices · dim.", true),
        Program("Haut du corps B", "5 exercices · jeu. 25", false),
        Program("Bas du corps B", "6 exercices", false),
    )

    data class PastSession(val name: String, val detail: String, val tonnage: String, val record: Boolean)

    val pastSessions = listOf(
        PastSession("Bas du corps A", "Dimanche · 55 min", "6,1 t", true),
        PastSession("Haut du corps B", "Jeudi 25 · 48 min", "2,3 t", false),
    )

    data class Friend(val initials: String, val name: String, val color: Long, val fresh: Boolean)

    val friends = listOf(
        Friend("JM", "Julie", 0xFFF8DDE1, true),
        Friend("TR", "Thomas", 0xFFDDE0EE, true),
        Friend("SB", "Sarah", 0xFFDDE0EE, false),
        Friend("AK", "Amine", 0xFFFDEBCC, false),
    )

    val leaderboard = listOf("Julie" to 4, "Toi" to 2, "Thomas" to 1)

    val tonnage = listOf(0.58f, 0.64f, 0.52f, 0.70f, 0.08f, 0.72f, 0.68f, 0.76f, 0.80f, 0.74f, 0.86f, 0.62f)
    val weightCurve = listOf(30f, 34f, 32f, 40f, 44f, 48f, 54f, 58f, 62f, 66f, 70f, 74f)

    data class Lift(val name: String, val oneRm: String, val delta: String?)

    val lifts = listOf(
        Lift("Développé couché", "83 kg", "+4"),
        Lift("Squat", "105 kg", "+7,5"),
        Lift("Tirage vertical", "67 kg", null),
        Lift("Soulevé de terre roumain", "96 kg", "+5"),
    )
}
