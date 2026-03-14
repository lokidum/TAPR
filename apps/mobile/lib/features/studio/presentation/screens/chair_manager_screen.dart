import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/studio/data/studio_chairs_repository.dart';
import 'package:tapr/features/studio/data/studio_models.dart';
import 'package:tapr/features/studio/data/studio_repository.dart';
import 'package:tapr/features/studio/presentation/widgets/chair_listing_form_sheet.dart';

class ChairManagerScreen extends ConsumerStatefulWidget {
  const ChairManagerScreen({super.key});

  @override
  ConsumerState<ChairManagerScreen> createState() => _ChairManagerScreenState();
}

class _ChairManagerScreenState extends ConsumerState<ChairManagerScreen> {
  List<StudioChairListing> _chairs = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final repo = ref.read(studioRepositoryProvider);
      final result = await repo.fetchMyChairs();
      if (!mounted) return;
      setState(() {
        _chairs = result.listings;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error = e.toString();
      });
    }
  }

  void _showAddSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => ChairListingFormSheet(
        onSuccess: () {
          _load();
        },
      ),
    );
  }

  void _showEditSheet(StudioChairListing listing) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => ChairListingFormSheet(
        existing: listing,
        onSuccess: () {
          _load();
        },
      ),
    );
  }

  Future<bool> _confirmDelete(StudioChairListing listing) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Delete listing?', style: TextStyle(color: AppColors.white)),
        content: Text(
          'This will remove "${listing.title}". Only available listings can be deleted.',
          style: AppTextStyles.bodySecondary,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel', style: TextStyle(color: AppColors.textSecondary)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return false;
    try {
      await ref.read(studioChairsRepositoryProvider).deleteChair(listing.id);
      if (!mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Listing deleted'),
          backgroundColor: AppColors.success,
          behavior: SnackBarBehavior.floating,
        ),
      );
      return true;
    } catch (e) {
      if (!mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString()),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text('Chair Manager', style: AppTextStyles.h2),
      ),
      body: _isLoading && _chairs.isEmpty
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.gold),
            )
          : _error != null && _chairs.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!, style: AppTextStyles.bodySecondary, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: _load,
                        child: const Text('Retry', style: TextStyle(color: AppColors.gold)),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  color: AppColors.gold,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(20),
                    itemCount: _chairs.length,
                    itemBuilder: (context, index) {
                      final listing = _chairs[index];
                      return Dismissible(
                        key: Key(listing.id),
                        direction: listing.status == 'available'
                            ? DismissDirection.endToStart
                            : DismissDirection.none,
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 20),
                          color: AppColors.error,
                          child: const Icon(Icons.delete_rounded, color: AppColors.white, size: 32),
                        ),
                        confirmDismiss: (direction) async {
                          if (listing.status != 'available') return false;
                          return _confirmDelete(listing);
                        },
                        onDismissed: (_) => _load(),
                        child: _ChairCard(
                          listing: listing,
                          onTap: () => _showEditSheet(listing),
                        ),
                      );
                    },
                  ),
                ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showAddSheet,
        backgroundColor: AppColors.gold,
        icon: const Icon(Icons.add_rounded),
        label: const Text('List a Chair'),
      ),
    );
  }
}

class _ChairCard extends StatelessWidget {
  const _ChairCard({
    required this.listing,
    required this.onTap,
  });

  final StudioChairListing listing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
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
                      child: Text(listing.title, style: AppTextStyles.h3),
                    ),
                    _StatusBadge(status: listing.status),
                  ],
                ),
                const SizedBox(height: 8),
                Text(listing.formattedPricePerDay, style: AppTextStyles.body),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text(
                      '${listing.rentalCount} rentals',
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
                        _listingTypeLabel(listing.listingType),
                        style: AppTextStyles.caption.copyWith(color: AppColors.gold),
                      ),
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

  String _listingTypeLabel(String t) {
    switch (t) {
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'sick_call':
        return 'Sick Call';
      case 'permanent':
        return 'Permanent';
      default:
        return t;
    }
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status) {
      case 'available':
        color = AppColors.success;
        break;
      case 'reserved':
        color = AppColors.gold;
        break;
      case 'occupied':
        color = AppColors.textSecondary;
        break;
      default:
        color = AppColors.textSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        _label,
        style: AppTextStyles.caption.copyWith(color: color),
      ),
    );
  }

  String get _label {
    switch (status) {
      case 'available':
        return 'Available';
      case 'reserved':
        return 'Reserved';
      case 'occupied':
        return 'Occupied';
      default:
        return status;
    }
  }
}
