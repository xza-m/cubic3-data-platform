"""统一身份与权限的内置目录。"""
from __future__ import annotations

BUILTIN_ACCESS_ROLE_CATALOG = {
    "platform_roles": [
        {
            "role_code": "governance_admin",
            "name": "管理员",
            "description": "管理权限配置、访问规则和审计记录，不自动拥有数据读取权限",
        },
        {
            "role_code": "product_manager",
            "name": "产品经理",
            "description": "查看业务对象、指标解释和产品分析入口，数据读取权限另行配置",
        },
        {
            "role_code": "semantic_modeler",
            "name": "数据开发",
            "description": "维护业务对象、指标、Cube 和语义草稿，数据读取权限另行配置",
        },
        {
            "role_code": "viewer",
            "name": "普通用户",
            "description": "使用基础入口和公开页面，数据读取权限另行配置",
        },
    ],
    "data_roles": [
        {
            "role_code": "data_m0_reader",
            "name": "基础数据读取",
            "description": "读取基础数据，默认覆盖 DIM / ADS 和公开语义结果",
        },
        {
            "role_code": "data_m1_reader",
            "name": "汇总数据读取",
            "description": "读取汇总数据，默认覆盖 DIM / DWS，并继承基础数据读取",
        },
        {
            "role_code": "data_m2_detail_reader",
            "name": "明细数据读取",
            "description": "读取受控明细数据，默认覆盖 DIM / DWD，并继承基础和汇总数据读取",
        },
    ],
    "api_key_scopes": [
        "agent.semantic.plan",
        "semantic.preview",
        "query.execute.request",
        "delegation.feishu_user",
        "audit.write",
    ],
}


BUILTIN_PERMISSION_PACKAGES = [
    {
        "package_code": "admin",
        "name": "管理员",
        "description": "管理权限配置、访问规则和审计记录；不自动包含数据读取权限",
        "role_codes": ["governance_admin", "auditor"],
        "role_type": "platform",
        "data_level": None,
    },
    {
        "package_code": "product_manager",
        "name": "产品经理",
        "description": "查看业务对象、指标解释和产品分析入口；数据读取权限另行配置",
        "role_codes": ["product_manager"],
        "role_type": "platform",
        "data_level": None,
    },
    {
        "package_code": "data_developer",
        "name": "数据开发",
        "description": "维护业务对象、指标、Cube 和语义草稿；数据读取权限另行配置",
        "role_codes": ["semantic_modeler"],
        "role_type": "platform",
        "data_level": None,
    },
    {
        "package_code": "normal_user",
        "name": "普通用户",
        "description": "使用基础入口和公开页面；数据读取权限另行配置",
        "role_codes": ["viewer"],
        "role_type": "platform",
        "data_level": None,
    },
    {
        "package_code": "data_m0_reader",
        "name": "基础数据读取",
        "description": "读取 DIM / ADS 等基础数据和公开语义结果",
        "role_codes": ["data_m0_reader"],
        "role_type": "data",
        "data_level": "M0",
    },
    {
        "package_code": "data_m1_reader",
        "name": "汇总数据读取",
        "description": "读取 DIM / DWS 等汇总数据，并继承基础数据读取",
        "role_codes": ["data_m0_reader", "data_m1_reader"],
        "role_type": "data",
        "data_level": "M1",
    },
    {
        "package_code": "data_m2_detail_reader",
        "name": "明细数据读取",
        "description": "读取 DIM / DWD 等受控明细数据，并继承基础和汇总数据读取",
        "role_codes": ["data_m0_reader", "data_m1_reader", "data_m2_detail_reader"],
        "role_type": "data",
        "data_level": "M2",
    },
]


PERMISSION_PACKAGE_BY_CODE = {
    item["package_code"]: item for item in BUILTIN_PERMISSION_PACKAGES
}
PERMISSION_PACKAGE_BY_CODE.update({
    "aggregate_data_reader": PERMISSION_PACKAGE_BY_CODE["data_m1_reader"],
    "controlled_detail_reader": PERMISSION_PACKAGE_BY_CODE["data_m2_detail_reader"],
    "governance_admin": PERMISSION_PACKAGE_BY_CODE["admin"],
})
