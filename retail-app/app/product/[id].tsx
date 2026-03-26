import { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useProductsStore } from '@store/useProductsStore'
import { useCartStore } from '@store/useCartStore'
import { useTheme } from '@theme/ThemeProvider'
import type { AppTheme } from '@theme/tokens'
import { ERROR_COLOR } from '@theme/tokens'
import { formatPrice } from '@utils/format'

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const product = useProductsStore((s) => s.selectedProduct)
  const isLoadingProduct = useProductsStore((s) => s.isLoadingProduct)
  const productError = useProductsStore((s) => s.productError)
  const loadProduct = useProductsStore((s) => s.loadProduct)

  const addItem = useCartStore((s) => s.addItem)
  const loadingProductIds = useCartStore((s) => s.loadingProductIds)

  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const [addedFeedback, setAddedFeedback] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (id) loadProduct(id)
  }, [id, loadProduct])

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  }, [])

  const isAddingToCart = loadingProductIds.includes(id ?? '')
  const outOfStock = product?.stock.available === 0

  const onAddToCart = useCallback(async () => {
    if (!product) return
    setAddError(null)
    try {
      await addItem(product.id)
      setAddedFeedback(true)
      feedbackTimerRef.current = setTimeout(() => setAddedFeedback(false), 2000)
    } catch (err) {
      setAddError((err as Error).message)
    }
  }, [product, addItem])

  if (isLoadingProduct) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    )
  }

  if (productError) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <Text style={styles.error}>{productError}</Text>
        <Pressable style={styles.retryBtn} onPress={() => id && loadProduct(id)}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  if (!product) return null

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={styles.container}
    >
      {/* Icon header */}
      <View style={styles.iconWrap}>
        <Ionicons name="cube-outline" size={72} color={theme.colors.primary} />
      </View>

      {/* Product name & category */}
      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.category}>{product.category}</Text>

      {/* Price */}
      <Text style={styles.price}>{formatPrice(product.price)}</Text>

      {/* Stock details */}
      <View style={styles.stockCard}>
        <Text style={styles.stockTitle}>Stock availability</Text>
        <View style={styles.stockRow}>
          <StockBadge label="Available" value={product.stock.available} color={theme.colors.primary} />
          {product.stock.reserved !== undefined && (
            <StockBadge label="Reserved" value={product.stock.reserved} color={theme.colors.muted} />
          )}
          {product.stock.sold !== undefined && (
            <StockBadge label="Sold" value={product.stock.sold} color={theme.colors.muted} />
          )}
        </View>
      </View>

      {/* Errors */}
      {addError && <Text style={styles.error}>{addError}</Text>}

      {/* Add to Cart */}
      {addedFeedback ? (
        <View style={[styles.addBtn, styles.addedBtn]}>
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Added to cart!</Text>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.addBtn,
            outOfStock && styles.addBtnDisabled,
            pressed && !outOfStock && { opacity: 0.8 },
          ]}
          onPress={onAddToCart}
          disabled={outOfStock || isAddingToCart}
          accessibilityRole="button"
          accessibilityLabel="Add to cart"
        >
          {isAddingToCart ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="cart-outline" size={20} color="#fff" />
              <Text style={styles.addBtnText}>
                {outOfStock ? 'Out of Stock' : 'Add to Cart'}
              </Text>
            </>
          )}
        </Pressable>
      )}

      {/* View cart shortcut */}
      <Pressable
        style={styles.viewCartBtn}
        onPress={() => router.push('/(tabs)/cart')}
      >
        <Text style={[styles.viewCartText, { color: theme.colors.primary }]}>
          View Cart
        </Text>
      </Pressable>
    </ScrollView>
  )
}

function StockBadge({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  const theme = useTheme()
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color }}>{value}</Text>
      <Text style={{ fontSize: 12, color: theme.colors.muted, marginTop: 2 }}>{label}</Text>
    </View>
  )
}

const makeStyles = (t: AppTheme) =>
  StyleSheet.create({
    container: { padding: t.spacing(6), paddingBottom: t.spacing(12) },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    iconWrap: {
      width: 120,
      height: 120,
      borderRadius: t.radius * 2,
      backgroundColor: t.colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: t.spacing(6),
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    name: {
      fontSize: 22,
      fontWeight: '700',
      color: t.colors.text,
      textAlign: 'center',
      marginBottom: t.spacing(2),
    },
    category: {
      fontSize: 14,
      color: t.colors.muted,
      textAlign: 'center',
      textTransform: 'capitalize',
      marginBottom: t.spacing(4),
    },
    price: {
      fontSize: 32,
      fontWeight: '800',
      color: t.colors.primary,
      textAlign: 'center',
      marginBottom: t.spacing(6),
    },
    stockCard: {
      backgroundColor: t.colors.card,
      borderRadius: t.radius,
      padding: t.spacing(4),
      marginBottom: t.spacing(6),
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    stockTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: t.colors.muted,
      marginBottom: t.spacing(3),
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    stockRow: { flexDirection: 'row' },
    error: { color: ERROR_COLOR, fontSize: 14, textAlign: 'center', marginBottom: t.spacing(4) },
    retryBtn: {
      paddingVertical: t.spacing(3),
      paddingHorizontal: t.spacing(6),
      backgroundColor: t.colors.primary,
      borderRadius: t.radius,
    },
    retryText: { color: '#fff', fontWeight: '600' },
    addBtn: {
      flexDirection: 'row',
      gap: t.spacing(2),
      backgroundColor: t.colors.primary,
      borderRadius: t.radius,
      paddingVertical: t.spacing(4),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: t.spacing(3),
    },
    addedBtn: { backgroundColor: '#16a34a' },
    addBtnDisabled: { backgroundColor: t.colors.muted },
    addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    viewCartBtn: { alignItems: 'center', paddingVertical: t.spacing(3) },
    viewCartText: { fontSize: 15, fontWeight: '600' },
  })
