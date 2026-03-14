import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_spacing.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/barber/data/barber_profile_models.dart';
import 'package:tapr/features/barber/data/barber_profile_repository.dart';
import 'package:tapr/features/legal/data/legal_models.dart';
import 'package:tapr/features/legal/data/legal_repository.dart';
import 'package:tapr/features/legal/presentation/screens/partnership_creation_screen.dart';
import 'package:tapr/shared/widgets/app_button.dart';

const _minLevelForLegalHub = 5;

class LegalHubScreen extends ConsumerStatefulWidget {
  const LegalHubScreen({super.key});

  @override
  ConsumerState<LegalHubScreen> createState() => _LegalHubScreenState();
}

class _LegalHubScreenState extends ConsumerState<LegalHubScreen> {
  BarberProfileDetail? _profile;
  List<Partnership> _partnerships = [];
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
      final profile = await ref.read(barberProfileRepositoryProvider).fetchMyProfile();
      if (!mounted) return;

      List<Partnership> partnerships = [];
      if (profile.level >= _minLevelForLegalHub) {
        final result = await ref.read(legalRepositoryProvider).fetchMyPartnerships();
        if (!mounted) return;
        partnerships = result.partnerships;
      }

      setState(() {
        _profile = profile;
        _partnerships = partnerships;
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

  Future<void> _openPartnershipCreation() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        fullscreenDialog: true,
        builder: (context) => const PartnershipCreationScreen(),
      ),
    );
    if (created == true && mounted) {
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          title: Text('Legal Hub', style: AppTextStyles.h2),
        ),
        body: const Center(
          child: CircularProgressIndicator(color: AppColors.gold),
        ),
      );
    }

    if (_error != null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          title: Text('Legal Hub', style: AppTextStyles.h2),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_error!, style: AppTextStyles.bodySecondary, textAlign: TextAlign.center),
                const SizedBox(height: AppSpacing.md),
                AppButton(label: 'Retry', onPressed: _load),
              ],
            ),
          ),
        ),
      );
    }

    final profile = _profile!;
    final isUnlocked = profile.level >= _minLevelForLegalHub;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text('Legal Hub', style: AppTextStyles.h2),
      ),
      body: isUnlocked ? _buildUnlockedContent(profile) : _buildLockedContent(profile),
    );
  }

  Widget _buildLockedContent(BarberProfileDetail profile) {
    final progress = profile.level / _minLevelForLegalHub;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: AppSpacing.lg),
          Icon(
            Icons.lock_rounded,
            size: 64,
            color: AppColors.gold.withValues(alpha: 0.6),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            'Available at Level $_minLevelForLegalHub',
            style: AppTextStyles.h2,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'You\'re Level ${profile.level}. Keep building your portfolio to unlock the Legal Hub.',
            style: AppTextStyles.bodySecondary,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.xl),
          Text('Progress to Level $_minLevelForLegalHub', style: AppTextStyles.caption),
          const SizedBox(height: AppSpacing.xs),
          LinearProgressIndicator(
            value: progress,
            backgroundColor: AppColors.divider,
            valueColor: const AlwaysStoppedAnimation<Color>(AppColors.gold),
            minHeight: 8,
            borderRadius: BorderRadius.circular(4),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Level ${profile.level} of $_minLevelForLegalHub',
            style: AppTextStyles.caption,
          ),
          const SizedBox(height: AppSpacing.xxl),
          Text('What unlocks at Level $_minLevelForLegalHub', style: AppTextStyles.h3),
          const SizedBox(height: AppSpacing.md),
          _buildBenefitItem('Partnership Builder'),
          _buildBenefitItem('Co-Op Joint Venture Agreements'),
          _buildBenefitItem('Salon License Agreements'),
          _buildBenefitItem('Independent Contractor Agreements'),
        ],
      ),
    );
  }

  Widget _buildBenefitItem(String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        children: [
          Icon(Icons.check_circle_outline, size: 20, color: AppColors.gold.withValues(alpha: 0.8)),
          const SizedBox(width: AppSpacing.sm),
          Expanded(child: Text(label, style: AppTextStyles.body)),
        ],
      ),
    );
  }

  Widget _buildUnlockedContent(BarberProfileDetail profile) {
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.gold,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildMyPartnershipsSection(profile),
            const SizedBox(height: AppSpacing.xxl),
            _buildLegalDocumentsSection(),
          ],
        ),
      ),
    );
  }

  Widget _buildMyPartnershipsSection(BarberProfileDetail profile) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('My Partnerships', style: AppTextStyles.h3),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: 'Start New Partnership',
          onPressed: _openPartnershipCreation,
          icon: Icons.add_rounded,
        ),
        const SizedBox(height: AppSpacing.md),
        if (_partnerships.isEmpty)
          Container(
            padding: const EdgeInsets.all(AppSpacing.lg),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            ),
            child: Text(
              'No partnerships yet. Start one to formalize a joint venture with another Level 5+ barber.',
              style: AppTextStyles.bodySecondary,
            ),
          )
        else
          ..._partnerships.map((p) => _PartnershipCard(
                partnership: p,
                myBarberId: profile.id,
              )),
      ],
    );
  }

  Widget _buildLegalDocumentsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Legal Documents', style: AppTextStyles.h3),
        const SizedBox(height: AppSpacing.md),
        for (final docType in LegalDocumentType.values)
          _LegalDocumentCard(
            docType: docType,
            onGenerate: docType == LegalDocumentType.coOpJointVenture
                ? _openPartnershipCreation
                : () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Coming soon'),
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                  },
          ),
      ],
    );
  }
}

class _PartnershipCard extends StatelessWidget {
  const _PartnershipCard({
    required this.partnership,
    required this.myBarberId,
  });

  final Partnership partnership;
  final String myBarberId;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  partnership.partnerDisplayName(myBarberId),
                  style: AppTextStyles.body.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: _statusColor(partnership.status).withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(100),
                ),
                child: Text(
                  partnership.status.displayLabel,
                  style: AppTextStyles.caption.copyWith(
                    color: _statusColor(partnership.status),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          if (partnership.businessName != null && partnership.businessName!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              partnership.businessName!,
              style: AppTextStyles.caption,
            ),
          ],
        ],
      ),
    );
  }

  Color _statusColor(PartnershipStatus status) {
    return switch (status) {
      PartnershipStatus.draft => AppColors.textSecondary,
      PartnershipStatus.sent => AppColors.gold,
      PartnershipStatus.partiallySigned => AppColors.gold,
      PartnershipStatus.fullyExecuted => AppColors.success,
      PartnershipStatus.dissolved => AppColors.error,
    };
  }
}

class _LegalDocumentCard extends StatelessWidget {
  const _LegalDocumentCard({
    required this.docType,
    required this.onGenerate,
  });

  final LegalDocumentType docType;
  final VoidCallback onGenerate;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(docType.title, style: AppTextStyles.h3),
          const SizedBox(height: AppSpacing.xs),
          Text(docType.description, style: AppTextStyles.bodySecondary),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: 'Generate',
            onPressed: onGenerate,
            isExpanded: false,
          ),
        ],
      ),
    );
  }
}
