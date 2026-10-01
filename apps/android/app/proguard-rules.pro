# kotlinx.serialization : les sérialiseurs générés sont retrouvés par réflexion.
-keepattributes *Annotation*, InnerClasses
-keepclassmembers @kotlinx.serialization.Serializable class fr.nutriperso.app.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
