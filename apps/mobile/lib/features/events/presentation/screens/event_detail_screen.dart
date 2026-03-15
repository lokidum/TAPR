import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/events/data/event_models.dart';
import 'package:tapr/features/events/data/event_repository.dart';
import 'package:tapr/features/events/presentation/event_detail_controller.dart';

class EventDetailScreen extends ConsumerStatefulWidget {
  const EventDetailScreen({super.key, required this.eventId});

  final String eventId;

  @override
  ConsumerState<EventDetailScreen> createState() => _EventDetailScreenState();
}

class _EventDetailScreenState extends ConsumerState<EventDetailScreen> {
  bool _descriptionExpanded = false;
  bool _isAttending = false;
  bool _attendLoading = false;

  @override
  Widget build(BuildContext context) {
    final eventAsync = ref.watch(eventDetailProvider(widget.eventId));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: eventAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.gold),
        ),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                e.toString(),
                style: AppTextStyles.bodySecondary,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () =>
                    ref.invalidate(eventDetailProvider(widget.eventId)),
                child: const Text(
                  'Retry',
                  style: TextStyle(color: AppColors.gold),
                ),
              ),
            ],
          ),
        ),
        data: (event) => CustomScrollView(
          slivers: [
            SliverAppBar(
              expandedHeight: 220,
              pinned: true,
              backgroundColor: AppColors.background,
              leading: IconButton(
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: () => Navigator.of(context).pop(),
              ),
              actions: [
                IconButton(
                  icon: const Icon(Icons.share_rounded),
                  onPressed: () => _shareEvent(event),
                ),
              ],
              flexibleSpace: FlexibleSpaceBar(
                background: _buildCover(event),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (event.status == EventStatus.live) _LiveBadge(),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.gold.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            event.eventType.label,
                            style: AppTextStyles.caption.copyWith(
                              color: AppColors.gold,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      event.title,
                      style: AppTextStyles.h1,
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        const Icon(
                          Icons.calendar_today_rounded,
                          size: 18,
                          color: AppColors.textSecondary,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '${DateFormat('EEEE, MMMM d').format(event.startsAt)} · ${DateFormat('h:mm a').format(event.startsAt)} – ${DateFormat('h:mm a').format(event.endsAt)}',
                          style: AppTextStyles.bodySecondary,
                        ),
                      ],
                    ),
                    if (event.locationAddress != null &&
                        event.locationAddress!.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Icons.location_on_outlined,
                            size: 18,
                            color: AppColors.textSecondary,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              event.locationAddress!,
                              style: AppTextStyles.bodySecondary,
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (event.lat != null && event.lng != null) ...[
                      const SizedBox(height: 16),
                      _MapPreview(lat: event.lat!, lng: event.lng!),
                    ],
                    if (event.description != null &&
                        event.description!.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      _ExpandableDescription(
                        text: event.description!,
                        expanded: _descriptionExpanded,
                        onTap: () =>
                            setState(() => _descriptionExpanded = !_descriptionExpanded),
                      ),
                    ],
                    const SizedBox(height: 20),
                    _OrganizerSection(event: event),
                    const SizedBox(height: 20),
                    _AttendeesSection(event: event),
                    const SizedBox(height: 24),
                    _AttendingToggle(
                      isAttending: _isAttending,
                      isLoading: _attendLoading,
                      onTap: () => _toggleAttending(event),
                    ),
                    if (event.hasFoodTrucks) ...[
                      const SizedBox(height: 24),
                      _FoodTrucksSection(),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCover(EventDetail event) {
    if (event.coverImageUrl != null) {
      return CachedNetworkImage(
        imageUrl: event.coverImageUrl!,
        fit: BoxFit.cover,
        placeholder: (_, __) => _CoverPlaceholder(eventType: event.eventType),
        errorWidget: (_, __, ___) =>
            _CoverPlaceholder(eventType: event.eventType),
      );
    }
    return _CoverPlaceholder(eventType: event.eventType);
  }

  void _shareEvent(EventDetail event) {
    Share.share(
      '${event.title}\n\n${event.description ?? ''}\n\n${event.locationAddress ?? ''}',
      subject: event.title,
    );
  }

  Future<void> _toggleAttending(EventDetail event) async {
    if (_attendLoading) return;
    setState(() => _attendLoading = true);
    try {
      final repo = ref.read(eventRepositoryProvider);
      if (_isAttending) {
        await repo.unattendEvent(event.id);
        setState(() => _isAttending = false);
      } else {
        await repo.attendEvent(event.id);
        setState(() => _isAttending = true);
      }
      ref.invalidate(eventDetailProvider(widget.eventId));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _attendLoading = false);
    }
  }
}

class _LiveBadge extends StatefulWidget {
  @override
  State<_LiveBadge> createState() => _LiveBadgeState();
}

class _LiveBadgeState extends State<_LiveBadge>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);
    _animation = Tween<double>(begin: 0.6, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _animation,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.error.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                color: AppColors.error,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              'LIVE',
              style: AppTextStyles.caption.copyWith(
                color: AppColors.error,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder({required this.eventType});

  final EventType eventType;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.gold.withValues(alpha: 0.4),
            AppColors.goldMuted.withValues(alpha: 0.3),
          ],
        ),
      ),
      child: Center(
        child: Icon(
          _eventTypeIcon,
          size: 64,
          color: AppColors.gold.withValues(alpha: 0.8),
        ),
      ),
    );
  }

  IconData get _eventTypeIcon {
    return switch (eventType) {
      EventType.workshop => Icons.school_rounded,
      EventType.liveActivation => Icons.campaign_rounded,
      EventType.popUp => Icons.storefront_rounded,
      EventType.guestSpot => Icons.person_rounded,
    };
  }
}

class _MapPreview extends StatelessWidget {
  const _MapPreview({required this.lat, required this.lng});

  final double lat;
  final double lng;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        height: 160,
        width: double.infinity,
        child: GoogleMap(
          initialCameraPosition: CameraPosition(
            target: LatLng(lat, lng),
            zoom: 15,
          ),
          markers: {
            Marker(
              markerId: const MarkerId('event'),
              position: LatLng(lat, lng),
            ),
          },
          zoomControlsEnabled: false,
          mapToolbarEnabled: false,
          myLocationButtonEnabled: false,
          liteModeEnabled: true,
        ),
      ),
    );
  }
}

class _ExpandableDescription extends StatelessWidget {
  const _ExpandableDescription({
    required this.text,
    required this.expanded,
    required this.onTap,
  });

  final String text;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const maxLines = 3;
    final shouldExpand = text.length > 150;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'About',
          style: AppTextStyles.h3,
        ),
        const SizedBox(height: 8),
        Text(
          text,
          style: AppTextStyles.bodySecondary,
          maxLines: expanded ? null : maxLines,
          overflow: expanded ? null : TextOverflow.ellipsis,
        ),
        if (shouldExpand)
          TextButton(
            onPressed: onTap,
            style: TextButton.styleFrom(
              padding: EdgeInsets.zero,
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(
              expanded ? 'Show less' : 'Show more',
              style: const TextStyle(color: AppColors.gold),
            ),
          ),
      ],
    );
  }
}

class _OrganizerSection extends StatelessWidget {
  const _OrganizerSection({required this.event});

  final EventDetail event;

  @override
  Widget build(BuildContext context) {
    final avatarUrl = event.studioAvatarUrl ?? event.organizerAvatarUrl;
    final name = event.displayOrganizer;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Organizer', style: AppTextStyles.h3),
        const SizedBox(height: 8),
        Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: AppColors.surface,
              backgroundImage:
                  avatarUrl != null ? CachedNetworkImageProvider(avatarUrl) : null,
              child: avatarUrl == null
                  ? const Icon(Icons.person_rounded, color: AppColors.textSecondary)
                  : null,
            ),
            const SizedBox(width: 12),
            Text(name, style: AppTextStyles.body),
          ],
        ),
      ],
    );
  }
}

class _AttendeesSection extends StatelessWidget {
  const _AttendeesSection({required this.event});

  final EventDetail event;

  @override
  Widget build(BuildContext context) {
    if (event.attendeeCount == 0 && event.attendees.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Attendees',
          style: AppTextStyles.h3,
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            ...event.attendees.take(5).map(
                  (a) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Tooltip(
                      message: a.firstName,
                      child: CircleAvatar(
                        radius: 20,
                        backgroundColor: AppColors.surface,
                        backgroundImage: a.avatarUrl != null
                            ? CachedNetworkImageProvider(a.avatarUrl!)
                            : null,
                        child: a.avatarUrl == null
                            ? Text(
                                a.firstName.isNotEmpty
                                    ? a.firstName[0].toUpperCase()
                                    : '?',
                                style: AppTextStyles.caption,
                              )
                            : null,
                      ),
                    ),
                  ),
                ),
            if (event.attendeeCount > 5)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '+${event.attendeeCount - 5} others',
                  style: AppTextStyles.caption,
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _AttendingToggle extends StatelessWidget {
  const _AttendingToggle({
    required this.isAttending,
    required this.isLoading,
    required this.onTap,
  });

  final bool isAttending;
  final bool isLoading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton.icon(
        onPressed: isLoading ? null : onTap,
        icon: isLoading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  color: AppColors.background,
                  strokeWidth: 2,
                ),
              )
            : Icon(
                isAttending ? Icons.star_rounded : Icons.star_outline_rounded,
                size: 22,
              ),
        label: Text(isAttending ? 'Attending' : 'I\'m interested'),
        style: FilledButton.styleFrom(
          backgroundColor: isAttending ? AppColors.gold : AppColors.surface,
          foregroundColor: isAttending ? AppColors.background : AppColors.white,
          padding: const EdgeInsets.symmetric(vertical: 16),
        ),
      ),
    );
  }
}

class _FoodTrucksSection extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.restaurant_rounded, color: AppColors.gold),
          const SizedBox(width: 12),
          Text(
            'Food trucks will be on site',
            style: AppTextStyles.body,
          ),
        ],
      ),
    );
  }
}
