"""字段候选层公共入口。"""

from .classifier import MeasureSemanticsInferer, SemanticFieldClassifier
from .service import FieldCandidateService
from .types import (
    FieldCandidate,
    FieldCandidateSet,
    FieldIssue,
    FieldRoleCandidate,
    MeasureSemantics,
    PhysicalTypeDescriptor,
    PhysicalTypeMapper,
    TypeCompatibilityPolicy,
)

__all__ = [
    "FieldCandidate",
    "FieldCandidateService",
    "FieldCandidateSet",
    "FieldIssue",
    "FieldRoleCandidate",
    "MeasureSemantics",
    "MeasureSemanticsInferer",
    "PhysicalTypeDescriptor",
    "PhysicalTypeMapper",
    "SemanticFieldClassifier",
    "TypeCompatibilityPolicy",
]
