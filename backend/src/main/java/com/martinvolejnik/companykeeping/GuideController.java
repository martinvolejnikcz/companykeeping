package com.martinvolejnik.companykeeping;

import java.util.Map;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
class GuideController {
    private final FounderGuide guide;

    GuideController(FounderGuide guide) {
        this.guide = guide;
    }

    @PatchMapping("/api/guide/{stepKey}")
    FounderGuide.Step save(@RequestAttribute Accounts.Account account, @PathVariable String stepKey,
                          @RequestBody Map<String,Object> body) {
        return guide.save(account.id(), stepKey, body);
    }
}
