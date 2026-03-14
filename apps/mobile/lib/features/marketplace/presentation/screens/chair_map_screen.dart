import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:intl/intl.dart';
import 'package:tapr/core/network/api_exception.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/marketplace/data/chair_marketplace_models.dart';
import 'package:tapr/features/marketplace/data/chair_marketplace_repository.dart';
import 'package:tapr/features/marketplace/presentation/chair_marketplace_controller.dart';
import 'package:tapr/shared/widgets/app_button.dart';

const _darkMapStyle = '''
[
  {"elementType":"geometry","stylers":[{"color":"#242f3e"}]},
  {"elementType":"labels.text.fill","stylers":[{"color":"#746855"}]},
  {"elementType":"labels.text.stroke","stylers":[{"color":"#242f3e"}]},
  {"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},
  {"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},
  {"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#263c3f"}]},
  {"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#6b9a76"}]},
  {"featureType":"road","elementType":"geometry","stylers":[{"color":"#38414e"}]},
  {"featureType":"road","elementType":"geometry.stroke","stylers":[{"color":"#212a37"}]},
  {"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#9ca5b3"}]},
  {"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#746855"}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#1f2835"}]},
  {"featureType":"road.highway","elementType":"labels.text.fill","stylers":[{"color":"#f3d19c"}]},
  {"featureType":"transit","elementType":"geometry","stylers":[{"color":"#2f3948"}]},
  {"featureType":"transit.station","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#17263c"}]},
  {"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#515c6d"}]},
  {"featureType":"water","elementType":"labels.text.stroke","stylers":[{"color":"#17263c"}]}
]
''';

class ChairMapScreen extends ConsumerStatefulWidget {
  const ChairMapScreen({super.key});

  @override
  ConsumerState<ChairMapScreen> createState() => _ChairMapScreenState();
}

class _ChairMapScreenState extends ConsumerState<ChairMapScreen> {
  bool _isMapView = true;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(chairMarketplaceControllerProvider.notifier).loadNearby();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(chairMarketplaceControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text('Chair Marketplace', style: AppTextStyles.h2),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: _ViewToggle(
                    isMapView: _isMapView,
                    onChanged: (v) => setState(() => _isMapView = v),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      body: state.isLoading && state.listings.isEmpty
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.gold),
            )
          : state.error != null && state.listings.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        state.error!,
                        style: AppTextStyles.bodySecondary,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: () => ref
                            .read(chairMarketplaceControllerProvider.notifier)
                            .refresh(),
                        child: const Text(
                          'Retry',
                          style: TextStyle(color: AppColors.gold),
                        ),
                      ),
                    ],
                  ),
                )
              : _isMapView
                  ? _MapView(state: state)
                  : _ListView(state: state),
    );
  }
}

class _ViewToggle extends StatelessWidget {
  const _ViewToggle({
    required this.isMapView,
    required this.onChanged,
  });

  final bool isMapView;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Expanded(
            child: GestureDetector(
              onTap: () => onChanged(true),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: isMapView ? AppColors.gold : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Map',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.body.copyWith(
                    color: isMapView ? AppColors.background : AppColors.textSecondary,
                    fontWeight: isMapView ? FontWeight.w600 : FontWeight.normal,
                  ),
                ),
              ),
            ),
          ),
          Expanded(
            child: GestureDetector(
              onTap: () => onChanged(false),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: !isMapView ? AppColors.gold : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'List',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.body.copyWith(
                    color: !isMapView ? AppColors.background : AppColors.textSecondary,
                    fontWeight: !isMapView ? FontWeight.w600 : FontWeight.normal,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MapView extends ConsumerWidget {
  const _MapView({required this.state});

  final ChairMarketplaceState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lat = state.userLat ?? -33.87;
    final lng = state.userLng ?? 151.2;

    return Stack(
      children: [
        GoogleMap(
          initialCameraPosition: CameraPosition(
            target: LatLng(lat, lng),
            zoom: 12,
          ),
          markers: _buildMarkers(state.listings, ref, context),
          myLocationEnabled: true,
          myLocationButtonEnabled: true,
          mapToolbarEnabled: false,
          zoomControlsEnabled: false,
          style: _darkMapStyle,
        ),
        Positioned(
          left: 16,
          right: 16,
          bottom: 24,
          child: _MapControls(
            radiusKm: state.radiusKm,
            sickCallOnly: state.sickCallOnly,
            onRadiusChanged: (v) => ref
                .read(chairMarketplaceControllerProvider.notifier)
                .setRadius(v.round()),
            onSickCallChanged: (v) => ref
                .read(chairMarketplaceControllerProvider.notifier)
                .setSickCallOnly(v),
          ),
        ),
      ],
    );
  }

  Set<Marker> _buildMarkers(
    List<NearbyChairListing> listings,
    WidgetRef ref,
    BuildContext context,
  ) {
    return listings.map((listing) {
      return Marker(
        markerId: MarkerId(listing.id),
        position: LatLng(listing.lat, listing.lng),
        icon: BitmapDescriptor.defaultMarkerWithHue(
          listing.isSickCall ? BitmapDescriptor.hueOrange : 43,
        ),
        infoWindow: InfoWindow(
          title: listing.studioName,
          snippet: listing.listingTypeLabel,
        ),
        onTap: () => _showChairListingSheet(context, ref, listing, state),
      );
    }).toSet();
  }

}

class _MapControls extends StatelessWidget {
  const _MapControls({
    required this.radiusKm,
    required this.sickCallOnly,
    required this.onRadiusChanged,
    required this.onSickCallChanged,
  });

  final int radiusKm;
  final bool sickCallOnly;
  final ValueChanged<double> onRadiusChanged;
  final ValueChanged<bool> onSickCallChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Radius: ${radiusKm}km', style: AppTextStyles.caption),
          Slider(
            value: radiusKm.toDouble(),
            min: 1,
            max: 50,
            divisions: 49,
            activeColor: AppColors.gold,
            onChanged: onRadiusChanged,
          ),
          Row(
            children: [
              Text('Sick call only', style: AppTextStyles.body),
              const Spacer(),
              Switch.adaptive(
                value: sickCallOnly,
                onChanged: onSickCallChanged,
                activeThumbColor: AppColors.gold,
                activeTrackColor: AppColors.gold.withValues(alpha: 0.3),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ListView extends ConsumerStatefulWidget {
  const _ListView({required this.state});

  final ChairMarketplaceState state;

  @override
  ConsumerState<_ListView> createState() => _ListViewState();
}

class _ListViewState extends ConsumerState<_ListView> {
  static const _pageSize = 10;
  int _visibleCount = _pageSize;

  @override
  void didUpdateWidget(_ListView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.state.listings != widget.state.listings) {
      _visibleCount = _pageSize;
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    // TODO: revisit server-side pagination if listings exceed 200 results in a single radius query.
    final displayedListings =
        state.listings.take(_visibleCount.clamp(0, state.listings.length)).toList();
    final hasMore = state.listings.length > displayedListings.length;

    if (state.listings.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.chair_rounded,
              size: 48,
              color: AppColors.textSecondary.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 8),
            Text(
              'No chairs nearby',
              style: AppTextStyles.bodySecondary,
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: displayedListings.length + (hasMore ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == displayedListings.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Center(
              child: TextButton(
                onPressed: () =>
                    setState(() => _visibleCount += _pageSize),
                child: const Text(
                  'Load More',
                  style: TextStyle(color: AppColors.gold),
                ),
              ),
            ),
          );
        }
        final listing = displayedListings[index];
        return _ChairListCard(
          listing: listing,
          barberLevel: state.barberLevel,
          onTap: () => _showChairListingSheet(context, ref, listing, state),
        );
      },
    );
  }
}

void _showChairListingSheet(
  BuildContext context,
  WidgetRef ref,
  NearbyChairListing listing,
  ChairMarketplaceState state,
) {
  final isEligible = state.barberLevel >= listing.minLevelRequired;

  showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.divider,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(listing.studioName, style: AppTextStyles.h3),
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.location_on_rounded,
                    size: 16, color: AppColors.textSecondary),
                const SizedBox(width: 4),
                Text(
                  '${listing.distanceKm.toStringAsFixed(1)} km away',
                  style: AppTextStyles.caption,
                ),
                const SizedBox(width: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.gold.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    listing.listingTypeLabel,
                    style: AppTextStyles.caption.copyWith(
                      color: AppColors.gold,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(listing.formattedPricePerDay, style: AppTextStyles.body),
            if (listing.formattedPricePerWeek != null)
              Text(
                listing.formattedPricePerWeek!,
                style: AppTextStyles.caption,
              ),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(
                  isEligible ? Icons.check_circle_rounded : Icons.lock_rounded,
                  size: 18,
                  color: isEligible ? AppColors.success : AppColors.textSecondary,
                ),
                const SizedBox(width: 6),
                Text(
                  'Level ${listing.minLevelRequired} required',
                  style: AppTextStyles.caption.copyWith(
                    color: isEligible ? AppColors.textSecondary : AppColors.error,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            AppButton(
              label: isEligible
                  ? 'Rent This Chair'
                  : 'Level ${listing.minLevelRequired} Required',
              onPressed: isEligible
                  ? () {
                      Navigator.pop(ctx);
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (c) => _ChairRentalScreen(listing: listing),
                        ),
                      );
                    }
                  : null,
            ),
            SizedBox(height: MediaQuery.of(ctx).padding.bottom + 8),
          ],
        ),
      ),
    ),
  );
}

class _ChairListCard extends StatelessWidget {
  const _ChairListCard({
    required this.listing,
    required this.barberLevel,
    required this.onTap,
  });

  final NearbyChairListing listing;
  final int barberLevel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isEligible = barberLevel >= listing.minLevelRequired;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        listing.studioName,
                        style: AppTextStyles.h3,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.gold.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        listing.listingTypeLabel,
                        style: AppTextStyles.caption.copyWith(
                          color: AppColors.gold,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.location_on_rounded,
                        size: 14, color: AppColors.textSecondary),
                    const SizedBox(width: 4),
                    Text(
                      '${listing.distanceKm.toStringAsFixed(1)} km',
                      style: AppTextStyles.caption,
                    ),
                    const SizedBox(width: 12),
                    Text(
                      listing.formattedPricePerDay,
                      style: AppTextStyles.body,
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      isEligible ? Icons.check_circle_rounded : Icons.lock_rounded,
                      size: 16,
                      color: isEligible ? AppColors.success : AppColors.textSecondary,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'Level ${listing.minLevelRequired} required',
                      style: AppTextStyles.caption,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

int _calculateRentalPriceCents(
  DateTime startAt,
  DateTime endAt,
  NearbyChairListing listing,
) {
  final durationMs = endAt.difference(startAt).inMilliseconds;
  final days = (durationMs / (24 * 60 * 60 * 1000)).ceil();
  if (days < 1) return listing.priceCentsPerDay;

  if (listing.listingType == 'weekly' &&
      listing.priceCentsPerWeek != null &&
      days >= 7) {
    final fullWeeks = days ~/ 7;
    final remainingDays = days % 7;
    return fullWeeks * listing.priceCentsPerWeek! +
        remainingDays * listing.priceCentsPerDay;
  }
  return days * listing.priceCentsPerDay;
}

class _ChairRentalScreen extends ConsumerStatefulWidget {
  const _ChairRentalScreen({required this.listing});

  final NearbyChairListing listing;

  @override
  ConsumerState<_ChairRentalScreen> createState() => _ChairRentalScreenState();
}

class _ChairRentalScreenState extends ConsumerState<_ChairRentalScreen> {
  DateTime? _startAt;
  DateTime? _endAt;
  bool _isPaying = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startAt = widget.listing.availableFrom;
    _endAt = widget.listing.availableFrom.add(const Duration(days: 1));
  }

  Future<void> _pickDates() async {
    final now = DateTime.now();
    final firstDate = widget.listing.availableFrom.isBefore(now)
        ? now
        : widget.listing.availableFrom;
    final lastDate = widget.listing.availableTo;

    final range = await showDateRangePicker(
      context: context,
      firstDate: firstDate,
      lastDate: lastDate,
      initialDateRange: DateTimeRange(
        start: _startAt ?? firstDate,
        end: _endAt ?? firstDate.add(const Duration(days: 1)),
      ),
      builder: (context, child) {
        return Theme(
          data: ThemeData.dark().copyWith(
            colorScheme: const ColorScheme.dark(
              primary: AppColors.gold,
              surface: AppColors.surface,
            ),
          ),
          child: child!,
        );
      },
    );
    if (!mounted || range == null) return;
    final selectedRange = range;
    setState(() {
      _startAt = selectedRange.start;
      _endAt = selectedRange.end;
      _error = null;
    });
  }

  Future<void> _handlePay() async {
    if (_startAt == null || _endAt == null) return;
    if (_endAt!.isBefore(_startAt!) || _endAt!.isAtSameMomentAs(_startAt!)) {
      setState(() => _error = 'End date must be after start date');
      return;
    }

    setState(() {
      _isPaying = true;
      _error = null;
    });

    try {
      final repo = ref.read(chairMarketplaceRepositoryProvider);
      final result = await repo.rentChair(
        widget.listing.id,
        startAt: _startAt!,
        endAt: _endAt!,
      );

      if (!mounted) return;

      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          paymentIntentClientSecret: result.clientSecret,
          merchantDisplayName: 'TAPR',
          style: ThemeMode.dark,
          appearance: const PaymentSheetAppearance(
            colors: PaymentSheetAppearanceColors(
              background: AppColors.surface,
              primary: AppColors.gold,
              componentBackground: AppColors.background,
              componentText: AppColors.white,
              primaryText: AppColors.white,
              secondaryText: AppColors.textSecondary,
              icon: AppColors.gold,
            ),
            shapes: PaymentSheetShape(borderRadius: 12),
          ),
        ),
      );

      await Stripe.instance.presentPaymentSheet();

      if (!mounted) return;
      _showSuccessAndPop();
    } on DioException catch (e) {
      if (!mounted) return;
      final msg = e.error is AppException
          ? (e.error as AppException).message
          : e.message ?? 'Rental failed';
      final displayMsg = msg.toLowerCase().contains('not available')
          ? 'This chair was just taken'
          : msg;
      setState(() {
        _isPaying = false;
        _error = displayMsg;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(displayMsg),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } on StripeException catch (e) {
      if (!mounted) return;
      String message;
      switch (e.error.code) {
        case FailureCode.Canceled:
          message = 'Payment cancelled';
          break;
        case FailureCode.Failed:
          message = 'Payment failed. Please check your card details and try again.';
          break;
        case FailureCode.Timeout:
          message = 'Payment timed out. Please try again.';
          break;
        default:
          message = e.error.localizedMessage ?? 'Payment failed. Please try again.';
      }
      setState(() {
        _isPaying = false;
        _error = message;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isPaying = false;
        _error = e.toString();
      });
    }
  }

  void _showSuccessAndPop() {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Rental confirmed', style: TextStyle(color: AppColors.white)),
        content: const Text(
          'Your chair rental has been confirmed. Check your bookings for details.',
          style: TextStyle(color: AppColors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.pop(context);
            },
            child: const Text('OK', style: TextStyle(color: AppColors.gold)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final priceCents = _startAt != null && _endAt != null
        ? _calculateRentalPriceCents(_startAt!, _endAt!, widget.listing)
        : 0;
    final priceDollars = priceCents / 100;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close, color: AppColors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('Rent Chair', style: AppTextStyles.h3),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.listing.studioName,
              style: AppTextStyles.h3,
            ),
            const SizedBox(height: 16),
            InkWell(
              onTap: _isPaying ? null : _pickDates,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.calendar_today_rounded, color: AppColors.gold),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        _startAt != null && _endAt != null
                            ? '${DateFormat.yMMMd().format(_startAt!)} – ${DateFormat.yMMMd().format(_endAt!)}'
                            : 'Select dates',
                        style: AppTextStyles.body,
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: AppColors.textSecondary),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Total', style: AppTextStyles.body),
                  Text(
                    '\$${priceDollars.toStringAsFixed(2)}',
                    style: AppTextStyles.h3,
                  ),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(
                _error!,
                style: AppTextStyles.bodySecondary.copyWith(color: AppColors.error),
              ),
            ],
            const SizedBox(height: 24),
            AppButton(
              label: 'Pay',
              onPressed: _isPaying ? null : _handlePay,
              isLoading: _isPaying,
            ),
          ],
        ),
      ),
    );
  }
}